import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Database } from '../types/database'
import { clearOrbitStorage, emitInvalidAuthEvent, isLikelyInvalidSession } from '../utils/auth'
import { nativeFetch } from '../utils/nativeHttp'
import { NativeUploader } from '../plugins/nativeUploader'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const PASSWORD_RESET_REDIRECT_URL = 'https://wehihi.com/reset-password'

const INVALID_AUTH_GRACE_MS = 1200
let invalidAuthTimer: ReturnType<typeof setTimeout> | null = null
let pendingInvalidReason = ''

const authAwareFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)

  // 路由策略：
  //   WebView fetch  → Storage POST（multipart 流式 body，nativeFetch 不支持）
  //                  → Edge Functions（CORS 需要带 Origin，走 WebView 更安全）
  //   nativeFetch    → Auth（/auth/v1/）+ REST（/rest/v1/）：绕开 WKWebView 死连接，
  //                    唤醒后立即可用，彻底消灭 getSession-timeout
  const isStorageUpload =
    /\/storage\/v1\/object\//.test(url) && (init?.method?.toUpperCase() ?? 'GET') === 'POST'
  const isEdgeFunction = /\/functions\/v1\//.test(url)
  const mustUseWebViewFetch = isStorageUpload || isEdgeFunction

  const fetchFn = mustUseWebViewFetch ? fetch : nativeFetch
  const response = await fetchFn(input, init)

  try {
    if (response.status === 401 || response.status === 403) {
      const errorCode = response.headers.get('x-sb-error-code') || ''
      const authRelatedEndpoint = /\/auth\/v1\//.test(url) || /\/rest\/v1\//.test(url)

      if (authRelatedEndpoint && isLikelyInvalidSession(errorCode || `http_${response.status}`)) {
        pendingInvalidReason = errorCode || `http_${response.status}`
        if (!invalidAuthTimer) {
          invalidAuthTimer = setTimeout(() => {
            invalidAuthTimer = null
            emitInvalidAuthEvent(pendingInvalidReason || `http_${response.status}`)
          }, INVALID_AUTH_GRACE_MS)
        }
      }
    }
  } catch (e) {
    console.warn('authAwareFetch inspect failed:', e)
  }

  return response
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: {
    // 只需要保留这一个！
    // 只要 authAwareFetch 内部调用的是 fetch()，它就会自动走 Capacitor 的原生通道
    fetch: authAwareFetch,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn()
    },
  },
})

const supabaseRef = new URL(supabaseUrl).hostname.split('.')[0]
const SUPABASE_STORAGE_KEY = `sb-${supabaseRef}-auth-token`

/** Read the persisted session directly from localStorage, bypassing the SDK's
 *  internal async state machine (which can deadlock after app backgrounding). */
export function getSessionFromStorage(): {
  access_token: string
  refresh_token: string
  expires_at: number
} | null {
  try {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw)
    if (!stored?.access_token) return null
    return stored
  } catch {
    return null
  }
}

// Bypass the SDK's internal fetchWithAuth -> _getAccessToken() -> auth.getSession()
// pipeline for REST queries. The SDK acquires a JS-level lock inside getSession()
// that contends with the visibility-change handler on app resume, blocking ALL
// REST requests until the lock drains. Reading the token from localStorage is
// synchronous and sidesteps the entire lock/queue mechanism.
; (supabase as any).rest.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const stored = getSessionFromStorage()
  const token = stored?.access_token ?? supabaseAnonKey

  const headers = new Headers(init?.headers)
  if (!headers.has('apikey')) headers.set('apikey', supabaseAnonKey)
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  return authAwareFetch(input, { ...init, headers })
}

const UPLOAD_TIMEOUT_MS = 45000
/** Only around NativeUploader.upload — excludes base64 prep and token lookup */
const NATIVE_STORAGE_UPLOAD_TIMEOUT_MS = 35000

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = UPLOAD_TIMEOUT_MS): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('上传超时，请检查网络后重试')), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise])
}

// 增强版：检测 Session 是否真的有效，避免在高频率切屏时进入假死
export const checkSessionIsHealthy = async () => {
  try {
    // 0. 网络预检：如果 navigator 说离线，大概率是真的
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false;
    }

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return false;

    // 1. 本地检查：令牌有效期是否充足
    const expiresAt = session.expires_at || 0;
    const now = Math.floor(Date.now() / 1000);

    // 如果 token 离过期还不到 10 分钟，强制刷新一下
    if (expiresAt - now < 600) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) return false;
    }

    // 2. Ping 检查 (确认底层网络连通性，防止虽然有 Session 但发不出请求的死锁)
    try {
      // 设置 3 秒超时，避免挂起
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
      const pingPromise = supabase.from('profiles').select('id').eq('id', session.user.id).limit(1).single();

      const { error: pingError } = await Promise.race([pingPromise, timeoutPromise]) as any;
      if (pingError) {
        console.warn('Session ping check failed, marking as unhealthy');
        return false;
      }
    } catch (err) {
      console.warn('Session ping check threw error:', err);
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
};

const ensureOnlineForWrite = (action: string) => {
  // 仅在明确离线时抛出错误，增加容错，避免 navigator.onLine 在切屏后的误报
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(`当前离线，暂时无法${action}。请联网后重试。`);
  }
}

// 在文件顶部定义一个通用的同步函数
const syncStorageUsed = async (bytes: number) => {
  // 注意：此处调用 rpc 可能与数据库 Trigger 并行运行，如有冲突请删除此函数调用
  // 若 increment_storage 函数未定义，请忽略错误或在 SQL Editor 中创建该函数
  const { error } = await (supabase as any).rpc('increment_storage', { x: bytes });
  if (error) {
    // 忽略 RPC 错误（可能是因为未创建对应 SQL 函数），转交给 Trigger 处理
    // console.warn('同步存储空间失败:', error);
  }
};

// ==================== 照片上传 ====================

export const uploadPhoto = async (
  userId: string,
  file: File
): Promise<string> => {
  ensureOnlineForWrite('上传图片')
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

  if (Capacitor.isNativePlatform()) {
    // On iOS/Android: bypass WebView by uploading via native URLSession.
    // This avoids WebView network suspension when the app is backgrounded.
    const arrayBuffer = await file.arrayBuffer()
    // Convert ArrayBuffer to base64 in chunks to avoid call-stack overflow on large files
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const base64Data = btoa(binary)

    // Read token directly from localStorage — instant, no network call.
    // supabase.auth.getSession() hangs after iOS background because it
    // internally calls _refreshAccessToken() via WebView fetch (dead).
    // Even a slightly expired token is fine: if the server rejects it,
    // the upload fails fast and gets retried when the network recovers.
    let authToken = ''
    try {
      const raw = localStorage.getItem(SUPABASE_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        authToken = parsed.access_token || parsed?.currentSession?.access_token || ''
      }
    } catch { /* localStorage read failed */ }

    // Fallback: try getSession() with a tight timeout if localStorage had nothing
    if (!authToken) {
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('getSession-upload-timeout')), 5_000)),
        ])
        authToken = sessionResult.data?.session?.access_token ?? ''
      } catch { /* timed out — no token available */ }
    }

    console.log(`[uploadPhoto] token: ${authToken ? `OK (${authToken.length}ch)` : 'EMPTY'}`)
    if (!authToken) throw new Error('无法获取登录凭证，请稍后重试')

    const { publicUrl } = await Promise.race([
      NativeUploader.upload({
        base64Data,
        fileName,
        bucket: 'photos',
        contentType: file.type || 'image/jpeg',
        supabaseUrl,
        supabaseAnonKey,
        authToken,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('图片上传超时，请检查网络后重试')),
          NATIVE_STORAGE_UPLOAD_TIMEOUT_MS,
        )
      }),
    ])

    await syncStorageUsed(file.size)
    return publicUrl
  }

  // Web: use the standard Supabase JS storage client
  const { error: uploadError } = await withTimeout(
    supabase.storage
      .from('photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })
  )

  if (uploadError) throw uploadError

  // 新增：手动调用 RPC 同步（注意：若 storage-quota-migration.sql 触发器已生效，此处会导致双倍计数）
  await syncStorageUsed(file.size)

  // 获取公开 URL
  const { data: { publicUrl } } = supabase.storage
    .from('photos')
    .getPublicUrl(fileName)

  return publicUrl
}

export const uploadMultiplePhotos = async (
  userId: string,
  files: File[]
): Promise<string[]> => {
  const uploadPromises = files.map(file => uploadPhoto(userId, file))
  return Promise.all(uploadPromises)
}

export const deletePhoto = async (url: string): Promise<void> => {
  // 从 URL 提取文件路径
  const urlObj = new URL(url)
  const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/photos\/(.+)$/)

  if (!pathMatch) throw new Error('Invalid photo URL')

  const filePath = pathMatch[1]

  const { error } = await supabase.storage
    .from('photos')
    .remove([filePath])

  if (error) throw error
}

// ==================== 视频上传 ====================

export const uploadVideo = async (
  userId: string,
  file: File
): Promise<string> => {
  ensureOnlineForWrite('上传视频')
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

  const { error: uploadError } = await withTimeout(
    supabase.storage
      .from('videos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      })
  )

  if (uploadError) throw uploadError

  // 获取公开 URL
  const { data: { publicUrl } } = supabase.storage
    .from('videos')
    .getPublicUrl(fileName)

  return publicUrl
}

export const uploadMultipleVideos = async (
  userId: string,
  files: File[]
): Promise<string[]> => {
  const uploadPromises = files.map(file => uploadVideo(userId, file))
  return Promise.all(uploadPromises)
}

// ==================== 语音上传 ====================

export const uploadAudio = async (
  userId: string,
  blob: Blob
): Promise<string> => {
  ensureOnlineForWrite('上传语音')
  const mimeType = blob.type || 'audio/webm'
  const ext = mimeType.includes('mp4') || mimeType.includes('aac') ? 'm4a' : 'webm'
  const fileName = `${userId}/${Date.now()}-voice.${ext}`
  const { error: uploadError } = await withTimeout(
    supabase.storage
      .from('videos') // reuse videos bucket (supports audio too)
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: mimeType,
      })
  )
  if (uploadError) throw uploadError
  const { data: { publicUrl } } = supabase.storage.from('videos').getPublicUrl(fileName)
  return publicUrl
}

export const deleteVideo = async (url: string): Promise<void> => {
  const urlObj = new URL(url)
  const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/videos\/(.+)$/)

  if (!pathMatch) throw new Error('Invalid video URL')

  const filePath = pathMatch[1]

  const { error } = await supabase.storage
    .from('videos')
    .remove([filePath])

  if (error) throw error
}

// ==================== 头像上传 ====================

export const uploadAvatar = async (
  userId: string,
  file: File
): Promise<string> => {
  ensureOnlineForWrite('上传头像')
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/avatar.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true, // 允许覆盖旧头像
    })

  if (uploadError) throw uploadError

  // 新增：头像是小文件，但也计入
  await syncStorageUsed(file.size);

  // 获取公开 URL
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName)

  // 加上时间戳防浏览器缓存
  const finalUrl = `${publicUrl}?v=${Date.now()}`

  // 更新用户 profile
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: finalUrl })
    .eq('id', userId)

  if (updateError) throw updateError

  return finalUrl
}

export const updateProfileAvatarUrl = async (userId: string, avatarUrl: string): Promise<string> => {
  ensureOnlineForWrite('更新头像链接')
  const cleanUrl = avatarUrl.trim()
  if (!cleanUrl) throw new Error('头像链接不能为空')

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: cleanUrl })
    .eq('id', userId)

  if (error) throw error

  try {
    await supabase.auth.updateUser({ data: { avatar_url: cleanUrl } })
  } catch (metaError) {
    console.warn('同步 auth metadata 失败（已忽略）:', metaError)
  }

  return cleanUrl
}

// ==================== 认证相关 ====================

const SIGNUP_ACCESS_CODE = (import.meta.env.VITE_SIGNUP_CODE || '').trim();

export const signUp = async (email: string, password: string, username: string, inviteCode?: string) => {
  ensureOnlineForWrite('注册账号')

  if (!SIGNUP_ACCESS_CODE) {
    throw new Error('注册通道未配置邀请码，请联系管理员');
  }

  const cleaned = (inviteCode || '').trim();
  if (!cleaned) {
    throw new Error('需要邀请码/口令才能注册');
  }
  if (cleaned !== SIGNUP_ACCESS_CODE) {
    throw new Error('邀请码/口令不正确，向邀请人确认后再试');
  }

  // 预先统计已注册人数，用于内测额度与序号
  const { count, error: countError } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })

  if (countError) {
    throw new Error(`获取内测名额失败，请稍后再试或联系管理员：${countError.message || countError}`)
  }

  const currentCount = typeof count === 'number' ? count : 0
  const BETA_CAP = 50
  if (currentCount >= BETA_CAP) {
    throw new Error('内测名额已满（50 人），请等待下一轮开放')
  }

  const betaJoinOrder = currentCount + 1

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        beta_join_order: betaJoinOrder,
      },
    },
  })

  if (error) throw error

  // Profile 会由数据库触发器自动创建
  // 触发器会从 auth.users.raw_user_meta_data 中读取 username
  // 同步内测序号到 profile（若触发器已创建则覆盖，若未创建则 upsert）
  try {
    const userId = data.user?.id
    if (userId) {
      await supabase
        .from('profiles')
        .upsert({ id: userId, beta_join_order: betaJoinOrder }, { onConflict: 'id' })
    }
  } catch (syncError) {
    console.warn('同步 beta_join_order 失败（已忽略）：', syncError)
  }

  return { data, betaJoinOrder }
}

export const signIn = async (email: string, password: string) => {
  ensureOnlineForWrite('登录')
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

export const signOut = async () => {
  // local scope is faster and more reliable for SPA logout UX
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
}

export const deleteMyAccount = async (confirmEmail: string) => {
  ensureOnlineForWrite('注销账号')

  const email = (confirmEmail || '').trim().toLowerCase()
  if (!email) {
    throw new Error('请输入邮箱确认后再注销')
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError

  const currentUser = userData.user
  if (!currentUser) {
    throw new Error('当前未登录，无法注销账号')
  }

  const currentEmail = (currentUser.email || '').trim().toLowerCase()
  if (!currentEmail || currentEmail !== email) {
    throw new Error('邮箱不匹配，请输入当前登录邮箱后重试')
  }

  // 优先走 Edge Function 做级联清理
  const { error: fnError } = await supabase.functions.invoke('delete-account', {
    body: { confirmEmail: email },
  })
  if (fnError) {
    // 兜底：如果 Edge Function 未部署，回退 RPC
    const { error } = await (supabase as any).rpc('delete_my_account')
    if (error) throw error
  }

  // 账号删除后清理本地会话
  await supabase.auth.signOut({ scope: 'local' })
}

// 发送重置密码邮件
export const sendPasswordReset = async (email: string) => {
  ensureOnlineForWrite('发送重置邮件')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: PASSWORD_RESET_REDIRECT_URL,
  });
  if (error) throw error;
  return true;
}

// 密码找回链接回跳后，设置新密码
export const updatePasswordAfterRecovery = async (newPassword: string) => {
  ensureOnlineForWrite('设置新密码')
  if (!newPassword || newPassword.length < 6) {
    throw new Error('新密码至少 6 位')
  }
  const { data, error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
  return data
}

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ==================== 邀请码 & 虚拟好友绑定 ====================

export const saveInviteCode = async (userId: string, inviteCode: string): Promise<void> => {
  ensureOnlineForWrite('保存邀请码')
  console.log('[saveInviteCode] 尝试保存邀请码', { userId, inviteCode });
  const { data, error } = await supabase
    .from('profiles')
    .update({ invite_code: inviteCode })
    .eq('id', userId)
    .select('id, invite_code')
  if (error) {
    console.error('[saveInviteCode] 保存失败:', JSON.stringify(error));
  } else {
    console.log('[saveInviteCode] 保存成功，返回数据:', JSON.stringify(data));
  }
}

export const lookupProfileByInviteCode = async (inviteCode: string) => {
  console.log('[lookupProfile] 查询邀请码:', inviteCode);
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, invite_code')
    .eq('invite_code', inviteCode)
    .maybeSingle()
  console.log('[lookupProfile] 原始结果:', JSON.stringify({ data, error }));
  if (error) throw new Error(`查询失败: ${JSON.stringify(error)}`)
  if (!data) throw new Error('找不到该邀请码，请确认对方已登录过 Orbit（登录后邀请码才会生效）')
  return data
}

const isPermissionError = (error: any) =>
  error?.code === '42501' || /permission|not allowed|violates row level security/i.test(error?.message || '');

const ensureAcceptedFriendship = async (userId: string, friendId: string): Promise<void> => {
  const { data: existingRows, error: fetchError } = await supabase
    .from('friendships')
    .select('id, status, created_at')
    .eq('user_id', userId)
    .eq('friend_id', friendId)
    .order('created_at', { ascending: true });

  if (fetchError) throw fetchError;

  if (!existingRows || existingRows.length === 0) {
    const { error: insertError } = await supabase
      .from('friendships')
      .insert({ user_id: userId, friend_id: friendId, status: 'accepted' });

    if (insertError && (insertError as any).code !== '23505') {
      throw insertError;
    }
    return;
  }

  if (existingRows.some((row: any) => row.status === 'accepted')) {
    return;
  }

  const ids = existingRows.map((row: any) => row.id);

  // 全部统一为 accepted
  const { error: updateError } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .in('id', ids);
  if (updateError) {
    if (isPermissionError(updateError)) {
      const { error: insertError } = await supabase
        .from('friendships')
        .insert({ user_id: userId, friend_id: friendId, status: 'accepted' });
      if (insertError && (insertError as any).code !== '23505') {
        throw insertError;
      }
      return;
    }
    throw updateError;
  }

  // 如果历史上已经有重复关系，保留最早一条，其余清理，避免列表出现重复好友
  if (ids.length > 1) {
    const [, ...duplicateIds] = ids;
    const { error: dedupeError } = await supabase
      .from('friendships')
      .delete()
      .in('id', duplicateIds);
    if (dedupeError && !isPermissionError(dedupeError)) throw dedupeError;
  }
};

export const bindVirtualFriend = async (
  friendshipId: string,
  realUserId: string
): Promise<{ syncedCount: number }> => {
  ensureOnlineForWrite('绑定好友')
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const currentUserId = authData?.user?.id;
  if (!currentUserId) throw new Error('当前未登录，无法绑定好友');
  if (currentUserId === realUserId) {
    throw new Error('不能绑定自己的邀请码');
  }
  // 0. 先查出发起方（A 的 user_id），用于创建反向记录
  const { data: existing, error: fetchErr } = await supabase
    .from('friendships')
    .select('user_id')
    .eq('id', friendshipId)
    .single();
  if (fetchErr) throw fetchErr;
  const ownerUserId = existing.user_id;
  if (ownerUserId !== currentUserId) {
    throw new Error('当前账号不是该马甲好友的创建者，无法绑定');
  }

  // 1. 更新 friendships.friend_id 为真实用户 UUID，状态改为 accepted
  const { error: e1 } = await supabase
    .from('friendships')
    .update({ friend_id: realUserId, status: 'accepted' })
    .eq('id', friendshipId)
    .eq('user_id', currentUserId)
  if (e1) throw e1

  // 2. 为真实用户 B 确保反向记录（B → A）且不重复
  try {
    await ensureAcceptedFriendship(realUserId, ownerUserId);
  } catch (e3: any) {
    const message = e3?.message || '创建反向好友关系失败';
    if (/row-level security|new row violates/i.test(message)) {
      throw new Error('Supabase 拒绝创建反向好友关系，请在 SQL Editor 中运行 friend-requests-migration.sql 后重试。');
    }
    throw new Error(message);
  }

  // 3. 将所有打了该马甲标签的 memory_tags 更新为真实用户 ID
  // virtual_friend_id 存的是 friendships.id
  const { data: syncedRows, error: e2 } = await supabase
    .from('memory_tags')
    .update({ user_id: realUserId, virtual_friend_id: null })
    .eq('virtual_friend_id', friendshipId)
    .select('id');
  if (e2) {
    const msg = e2.message || 'memory_tags 同步失败';
    if (/virtual_friend_id/i.test(msg)) {
      throw new Error('memory_tags 表缺少 virtual_friend_id 列，请运行 supabase-setup.sql 中的最新版本后重试。');
    }
    throw new Error(msg);
  }

  // 4. 防重：清理仍残留的虚拟标签行，避免卡片上出现“马甲+真实”双重 @
  await supabase
    .from('memory_tags')
    .delete()
    .eq('virtual_friend_id', friendshipId);

  const syncedCount = syncedRows?.length ?? 0;
  return { syncedCount };
}

export const getProfile = async (userId: string, userEmail?: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  // If profile doesn't exist or RLS blocks access, return null instead of throwing
  if (error) {
    // PGRST116 is "No rows found" - return null for this case
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }

  // Combine profile data with email from auth user
  return {
    ...data,
    email: userEmail || '',
  } as import('../types').User
}

export const updateProfileUsername = async (userId: string, username: string) => {
  ensureOnlineForWrite('修改昵称')
  const cleanName = username.trim()
  if (!cleanName) {
    throw new Error('昵称不能为空')
  }

  // 先走 update，避免 upsert 触发 INSERT 策略导致 "violates ... policy"
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ username: cleanName })
    .eq('id', userId)
    .select('id, username, avatar_url, created_at, invite_code')
    .maybeSingle()

  if (updateError) throw updateError

  let data = updated

  // 极少数情况下 profile 行不存在，再尝试插入
  if (!data) {
    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .insert({ id: userId, username: cleanName })
      .select('id, username, avatar_url, created_at, invite_code')
      .single()

    if (insertError) {
      const msg = (insertError as any)?.message || ''
      if (/violates|policy|permission|row-level security/i.test(msg)) {
        throw new Error('昵称保存被数据库策略拦截（profiles 写入权限）。请运行最新 SQL 迁移后重试。')
      }
      throw insertError
    }
    data = inserted
  }

  // 同步 auth user metadata，避免 profile 临时不可读时回退到旧昵称
  try {
    await supabase.auth.updateUser({ data: { username: cleanName } })
  } catch (metaError) {
    console.warn('同步 auth metadata 失败（已忽略，不影响 profile 保存）:', metaError)
  }

  return data
}

// ==================== 好友相关 ====================

export const getFriends = async (userId: string) => {
  // Join friendships with profiles using the user id
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      user_id,
      friend_id,
      status,
      friend:profiles(id, username, avatar_url, created_at)
    `)
    .eq('user_id', userId)
    .eq('status', 'accepted')

  if (error) throw error
  return data
}

export const addFriend = async (userId: string, friendId: string) => {
  ensureOnlineForWrite('添加好友')
  const { error } = await supabase
    .from('friendships')
    .insert({
      user_id: userId,
      friend_id: friendId,
      status: 'accepted',
    })

  if (error) throw error
}

// ==================== 记忆相关 ====================

const formatMemoryRecord = (memory: any, userId: string) => ({
  ...memory,
  is_owner: memory.user_id === userId,
  tagged_friends: [...new Set(
    (memory.tags?.map((tag: any) =>
      tag.user_id ? tag.user_id : (tag.virtual_friend_id ? `temp-${tag.virtual_friend_id}` : null)
    ).filter(Boolean) || []) as string[]
  )]
})

export const getMemories = async (userId: string) => {
  // 1. 自己创建的记忆
  const { data: ownMemories, error: ownError } = await supabase
    .from('memories')
    .select(`
      *,
      location:locations(*),
      tags:memory_tags(user_id, virtual_friend_id)
    `)
    .eq('user_id', userId)
    .order('memory_date', { ascending: false });

  if (ownError) {
    console.error('获取记忆列表失败:', ownError);
    throw ownError;
  }

  // 2. 被好友标记的记忆（真实好友 tag 后也能在自己的流里看到）
  const { data: taggedRows } = await supabase
    .from('memory_tags')
    .select('memory_id')
    .eq('user_id', userId);

  let taggedMemories: any[] = [];
  if (taggedRows && taggedRows.length > 0) {
    const ownIds = new Set((ownMemories || []).map((m: any) => m.id));
    const newIds = taggedRows.map((t: any) => t.memory_id).filter((id: string) => !ownIds.has(id));
    if (newIds.length > 0) {
      const { data: tagged } = await supabase
        .from('memories')
        .select(`
          *,
          location:locations(*),
          tags:memory_tags(user_id, virtual_friend_id)
        `)
        .in('id', newIds)
        .order('memory_date', { ascending: false });
      if (tagged) taggedMemories = tagged;
    }
  }

  const allMemories = [...(ownMemories || []), ...taggedMemories];

  const formattedData = allMemories.map((memory: any) => formatMemoryRecord(memory, userId));

  return formattedData;
}

export const createMemory = async (
  userId: string,
  content: string,
  memoryDate: string,
  locationId?: string,
  photos?: string[],
  taggedFriends?: string[],
  videos?: string[],
  audios?: string[],
  hasLedger?: boolean
) => {
  ensureOnlineForWrite('发布记忆')
  // 创建记忆
  const { data: memory, error: memoryError } = await supabase
    .from('memories')
    .insert({
      user_id: userId,
      content,
      memory_date: memoryDate,
      location_id: locationId,
      photos: photos || [],
      videos: videos || [],
      audios: audios || [],
      has_ledger: hasLedger || false,
    })
    .select()
    .single()

  if (memoryError) throw memoryError

  if ((taggedFriends || []).length > 0 && memory) {
    // 真实好友：直接存 user_id
    const realTags = (taggedFriends || [])
      .filter(id => !id.startsWith('temp-'))
      .map(friendId => ({ memory_id: memory.id, user_id: friendId, owner_id: userId }));

    // 虚拟好友：存 virtual_friend_id = friendships.id（去掉 temp- 前缀）
    const virtualTags = (taggedFriends || [])
      .filter(id => id.startsWith('temp-'))
      .map(id => ({ memory_id: memory.id, virtual_friend_id: id.replace('temp-', ''), owner_id: userId }));

    const allTags = [...realTags, ...virtualTags]
    if (allTags.length > 0) {
      const { error: tagsError } = await supabase.from('memory_tags').insert(allTags)
      if (tagsError) throw tagsError
    }
  }

  if (!memory) return memory

  const { data: hydratedMemory, error: hydratedMemoryError } = await supabase
    .from('memories')
    .select(`
      *,
      location:locations(*),
      tags:memory_tags(user_id, virtual_friend_id)
    `)
    .eq('id', memory.id)
    .single()

  if (hydratedMemoryError) {
    console.warn('新记忆补全关联信息失败，先回退基础数据:', hydratedMemoryError)
    return {
      ...memory,
      location: null,
      tags: [],
      tagged_friends: taggedFriends || [],
      is_owner: true,
    }
  }

  return formatMemoryRecord(hydratedMemory, userId)
}

// ==================== 地点相关 ====================

// 替换 api/supabase.ts 里的 createLocation 函数
export const createLocation = async (
  name: string,
  lat: number,
  lng: number,
  address?: string,
  category?: string,
  userId?: string // ✨ 1. 接收从前端传来的 userId
) => {
  ensureOnlineForWrite('创建地点')
  const { data, error } = await supabase
    .from('locations')
    .insert({
      name,
      lat,
      lng,
      address,
      category,
      created_by: userId, // ✨ 2. 核心！必须把 userId 赋给数据库里的 created_by 字段
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ==================== 账单相关 ====================

export const createLedger = async (
  creatorId: string,
  totalAmount: number,
  participants: { userId: string; amount: number }[],
  memoryId?: string,
  expenseType: 'shared' | 'personal' = 'shared',
  description?: string
) => {
  ensureOnlineForWrite('创建账单')
  // 创建账单
  const { data: ledger, error: ledgerError } = await supabase
    .from('ledgers')
    .insert({
      creator_id: creatorId,
      total_amount: totalAmount,
      memory_id: memoryId,
      currency: 'RMB',
      status: 'pending',
      expense_type: expenseType,
      description: description
    })
    .select()
    .single()

  if (ledgerError) throw ledgerError

  // 添加参与者
  if (ledger) {
    const participantRecords = participants.map(p => ({
      ledger_id: ledger.id,
      user_id: p.userId,
      amount: p.amount,
      paid: p.userId === creatorId, // 创建者默认已付
      paid_at: p.userId === creatorId ? new Date().toISOString() : null,
    }))

    const { error: participantsError } = await supabase
      .from('ledger_participants')
      .insert(participantRecords)

    if (participantsError) throw participantsError
  }

  return ledger
}

export const getLedgers = async (userId: string) => {
  const { data, error } = await supabase
    .from('ledgers')
    .select(`
      *,
      participants:ledger_participants(*)
    `)
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export const getLedgerByMemory = async (memoryId: string, userId: string) => {
  const { data, error } = await supabase
    .from('ledgers')
    .select(`
      *,
      participants:ledger_participants(*)
    `)
    .eq('memory_id', memoryId)
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

export const updateLedger = async (
  ledgerId: string,
  creatorId: string,
  totalAmount: number,
  participants: { userId: string; amount: number }[],
  memoryId?: string,
  expenseType: 'shared' | 'personal' = 'shared',
  description?: string
) => {
  ensureOnlineForWrite('更新账单')
  // 1. 更新账单主表
  const { error: ledgerError } = await supabase
    .from('ledgers')
    .update({
      total_amount: totalAmount,
      memory_id: memoryId,
      expense_type: expenseType,
      description: description
    })
    .eq('id', ledgerId)
  if (ledgerError) throw ledgerError

  // 2. 删除旧的参与者再重新插入
  await supabase.from('ledger_participants').delete().eq('ledger_id', ledgerId)
  if (participants.length > 0) {
    const records = participants.map(p => ({
      ledger_id: ledgerId,
      user_id: p.userId,
      amount: p.amount,
      paid: p.userId === creatorId,
      paid_at: p.userId === creatorId ? new Date().toISOString() : null,
    }))
    const { error: pErr } = await supabase.from('ledger_participants').insert(records)
    if (pErr) throw pErr
  }
}

export const deleteLedger = async (ledgerId: string): Promise<void> => {
  ensureOnlineForWrite('删除账单')
  const { error } = await supabase.from('ledgers').delete().eq('id', ledgerId)
  if (error) throw error
}

// ==================== 结算相关 ====================

export const getSettlements = async (userId: string) => {
  const { data, error } = await supabase
    .from('settlements')
    .select(`
      *,
      from_user:profiles!settlements_from_user_id_fkey(*),
      to_user:profiles!settlements_to_user_id_fkey(*)
    `)
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .eq('status', 'pending')

  if (error) throw error
  return data
}

export const settlePayment = async (settlementId: string) => {
  ensureOnlineForWrite('结清账单')
  const { error } = await supabase
    .from('settlements')
    .update({
      status: 'settled',
      settled_at: new Date().toISOString(),
    })
    .eq('id', settlementId)

  if (error) throw error
}
// 修改记忆内容
// ==========================================
// 更新记忆内容 (编辑功能)
// ==========================================
export const updateMemoryContent = async (memoryId: string, newContent: string) => {
  ensureOnlineForWrite('更新记忆')
  const { data, error } = await supabase
    .from('memories')
    .update({ content: newContent })
    .eq('id', memoryId)
    .select()
    .single();

  if (error) {
    console.error('更新记忆失败:', error);
    throw error;
  }
  return data;
}

// ==================== 好友删除 ====================
export const deleteFriendship = async (friendshipId: string): Promise<void> => {
  ensureOnlineForWrite('删除好友')

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const currentUserId = authData?.user?.id;
  if (!currentUserId) throw new Error('当前未登录，无法删除好友');

  const { data: row, error: fetchError } = await supabase
    .from('friendships')
    .select('id, user_id, friend_id, status')
    .eq('id', friendshipId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!row) return;

  const { data: deletedRows, error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('user_id', currentUserId)
    .select('id');
  if (error) throw error;
  if (!deletedRows || deletedRows.length === 0) {
    throw new Error('删除失败：没有权限或记录不存在');
  }

  // 如果是已绑定的真实好友，尝试把对方侧的关系降级为虚拟好友
  if (row.friend_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', row.user_id)
      .maybeSingle();

    const displayName = profile?.username || '已删除好友';

    const { data: reverse } = await supabase
      .from('friendships')
      .select('id, status, friend_id, user_id')
      .eq('user_id', row.friend_id)
      .eq('friend_id', row.user_id)
      .maybeSingle();

    if (reverse?.id && reverse.friend_id) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const currentUserId = authData?.user?.id;

      if (currentUserId && reverse.user_id === currentUserId) {
        const { error: downgradeError } = await supabase
          .from('friendships')
          .update({ friend_id: null, status: 'virtual', friend_name: displayName })
          .eq('id', reverse.id)
          .eq('user_id', currentUserId);
        if (downgradeError) {
          if (isPermissionError(downgradeError)) {
            throw new Error('缺少权限将对方关系降级为虚拟好友，请在 Supabase 执行 friend-requests-migration.sql');
          }
          throw downgradeError;
        }
      }
    }
  }
};

// 好友备注更新
export const updateFriendRemark = async (friendshipId: string, remark: string): Promise<void> => {
  ensureOnlineForWrite('更新好友备注')
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const currentUserId = authData?.user?.id;
  if (!currentUserId) throw new Error('当前未登录，无法更新好友备注');
  const { error } = await supabase
    .from('friendships')
    .update({ remark: remark || null } as any)
    .eq('id', friendshipId)
    .eq('user_id', currentUserId)
  if (error) throw error
}

// 通过邀请码发送好友申请（对方需要接受）
export const addRealFriendByCode = async (currentUserId: string, inviteCode: string): Promise<any> => {
  ensureOnlineForWrite('发送好友申请')
  const profile = await lookupProfileByInviteCode(inviteCode);

  if (profile.id === currentUserId) throw new Error('不能添加自己为好友');

  // 检查是否已经是好友或已发过申请（拉全量，避免重复脏数据导致误判）
  const { data: existingRows, error: existingError } = await supabase
    .from('friendships')
    .select('id, status, user_id, friend_id')
    .or(`and(user_id.eq.${currentUserId},friend_id.eq.${profile.id}),and(user_id.eq.${profile.id},friend_id.eq.${currentUserId})`)
    .order('created_at', { ascending: true });

  if (existingError) throw existingError;

  if (existingRows && existingRows.length > 0) {
    const hasAccepted = existingRows.some((row: any) => row.status === 'accepted' || row.status === 'virtual');
    const pendingFromMe = existingRows.filter((row: any) => row.status === 'pending' && row.user_id === currentUserId && row.friend_id === profile.id);
    const pendingFromOther = existingRows.filter((row: any) => row.status === 'pending' && row.user_id === profile.id && row.friend_id === currentUserId);

    if (hasAccepted) {
      throw new Error(`已经和 ${profile.username} 建立好友关系，无需重复添加`);
    }

    // 我方已经发过申请：清理重复后直接提示
    if (pendingFromMe.length > 0) {
      if (pendingFromMe.length > 1) {
        const duplicateIds = pendingFromMe.slice(1).map((row: any) => row.id);
        if (duplicateIds.length > 0) {
          await supabase.from('friendships').delete().in('id', duplicateIds);
        }
      }
      throw new Error('好友申请已发送，等待对方确认');
    }

    // 对方已向我发过申请：自动互加，避免双方重复点击
    if (pendingFromOther.length > 0) {
      await ensureAcceptedFriendship(currentUserId, profile.id);
      await ensureAcceptedFriendship(profile.id, currentUserId);
      return profile;
    }
  }

  const { error } = await supabase
    .from('friendships')
    .insert({
      user_id: currentUserId,
      friend_id: profile.id,
      status: 'pending',
    });
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(`已经和 ${profile.username} 建立好友关系，无需再次发送申请`);
    }
    throw error;
  }
  return profile;
};

// 获取收到的好友申请（status = 'pending'，friend_id = 自己）
export const getPendingFriendRequests = async (userId: string): Promise<any[]> => {
  // Step 1: 获取所有发给自己的 pending 记录
  const { data, error } = await supabase
    .from('friendships')
    .select('id, user_id, created_at')
    .eq('friend_id', userId)
    .eq('status', 'pending');

  if (error) {
    console.error('[getPendingFriendRequests] error:', error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  // Step 2: 批量查申请人的 profile（friendships.user_id → profiles.id）
  const requesterIds = data.map((r: any) => r.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', requesterIds);

  // Step 3: 如果双方已是 accepted，则过滤掉这条 pending，避免“幽灵申请”
  const { data: acceptedRows } = await supabase
    .from('friendships')
    .select('user_id, friend_id, status')
    .eq('status', 'accepted')
    .or(`and(user_id.eq.${userId},friend_id.in.(${requesterIds.join(',')})),and(user_id.in.(${requesterIds.join(',')}),friend_id.eq.${userId})`);

  const acceptedSet = new Set(
    (acceptedRows || []).map((row: any) => `${row.user_id}::${row.friend_id}`)
  );

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const deduped = data.reduce((acc: any[], row: any) => {
    if (acc.some((item) => item.user_id === row.user_id)) return acc;
    acc.push(row);
    return acc;
  }, []);

  return deduped
    .filter((r: any) => !acceptedSet.has(`${r.user_id}::${userId}`) && !acceptedSet.has(`${userId}::${r.user_id}`))
    .map((r: any) => ({
      ...r,
      requester: profileMap.get(r.user_id) || null,
    }));
};

// 接受好友申请：把发起方记录改为 accepted，再插一条反向记录
export const acceptFriendRequest = async (
  friendshipId: string,
  requesterId: string,
  currentUserId: string,
  bindVirtualFriendshipId?: string,
): Promise<void> => {
  ensureOnlineForWrite('处理好友申请')

  // 1) 先按 id 更新（兼容旧调用；即便 0 行也不阻断后续幂等修复）
  const { error: updateError } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .eq('user_id', currentUserId);
  if (updateError && !isPermissionError(updateError)) throw updateError;

  // 2) 双向都做幂等修复，确保“同意一次”后双方都能立即看到彼此
  await ensureAcceptedFriendship(requesterId, currentUserId);
  await ensureAcceptedFriendship(currentUserId, requesterId);

  // 3) 清理残留 pending，避免同一个人出现第二条可同意申请
  const { error: cleanRequesterPendingError } = await supabase
    .from('friendships')
    .delete()
    .eq('user_id', requesterId)
    .eq('friend_id', currentUserId)
    .eq('status', 'pending');
  if (cleanRequesterPendingError && !isPermissionError(cleanRequesterPendingError)) throw cleanRequesterPendingError;

  const { error: cleanCurrentPendingError } = await supabase
    .from('friendships')
    .delete()
    .eq('user_id', currentUserId)
    .eq('friend_id', requesterId)
    .eq('status', 'pending');
  if (cleanCurrentPendingError && !isPermissionError(cleanCurrentPendingError)) throw cleanCurrentPendingError;

  // 4) 可选：把已存在的马甲好友绑定到此真实用户
  if (bindVirtualFriendshipId) {
    // 利用现有的绑定逻辑（会同步 memory_tags 并创建反向关系，重复插入会被 23505 吃掉）
    await bindVirtualFriend(bindVirtualFriendshipId, requesterId);
  }
};

// 拒绝 / 忽略好友申请
export const rejectFriendRequest = async (friendshipId: string): Promise<void> => {
  ensureOnlineForWrite('拒绝好友申请')
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const currentUserId = authData?.user?.id;
  if (!currentUserId) throw new Error('当前未登录，无法拒绝好友申请');
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('friend_id', currentUserId);
  if (error) throw error;
};

// ==================== 记忆删除 ====================
export const deleteMemory = async (memoryId: string): Promise<void> => {
  ensureOnlineForWrite('删除记忆')
  // 先删关联标签，再删记忆本体
  await supabase.from('memory_tags').delete().eq('memory_id', memoryId);
  const { error } = await supabase.from('memories').delete().eq('id', memoryId);
  if (error) throw error;
};

export const getMemoryComments = async (memoryIds: string[]) => {
  // Supabase 列 memory_id 为 uuid，过滤演示模式的非 uuid id，避免 22P02
  const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  const validIds = memoryIds.filter((id) => isUuid(id));
  if (!validIds.length) return [];

  const { data, error } = await supabase
    .from('memory_comments')
    .select('id, memory_id, author_id, content, created_at')
    .in('memory_id', validIds)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export const addMemoryComment = async (
  memoryId: string,
  authorId: string,
  content: string,
) => {
  ensureOnlineForWrite('发表评论')

  const cleanContent = content.trim()
  if (!cleanContent) {
    throw new Error('评论不能为空')
  }

  const { data, error } = await supabase
    .from('memory_comments')
    .insert({
      memory_id: memoryId,
      author_id: authorId,
      content: cleanContent,
    })
    .select('id, memory_id, author_id, content, created_at')
    .single()

  if (error) throw error
  return data
}

export const deleteMemoryComment = async (commentId: string) => {
  ensureOnlineForWrite('删除评论')

  const { error } = await supabase
    .from('memory_comments')
    .delete()
    .eq('id', commentId)

  if (error) throw error
}

// ==================== 通知偏好相关 ====================

export const getUserNotificationPrefs = async (userId: string) => {
  const res: any = await supabase
    .from('profiles')
    .select('notification_prefs')
    .eq('id', userId)
    .single()

  if (res.error) throw res.error
  const data = res.data as any
  return (data && data.notification_prefs) ? data.notification_prefs : {}
}

export const updateUserNotificationPrefs = async (userId: string, prefs: Record<string, any>) => {
  ensureOnlineForWrite('更新通知设置')

  const res: any = await supabase
    .from('profiles')
    .update({ notification_prefs: prefs } as any)
    .eq('id', userId)
    .select('notification_prefs')
    .single()

  if (res.error) throw res.error
  return res.data?.notification_prefs
}

export const setOneSignalPlayerId = async (userId: string, playerId: string | null) => {
  ensureOnlineForWrite('更新推送标识')

  const res: any = await supabase
    .from('profiles')
    .update({ one_signal_player_id: playerId } as any)
    .eq('id', userId)

  if (res.error) throw res.error
}

// ==================== 帮助中心问题反馈 ====================

export const submitHelpQuestionFeedback = async (input: {
  question: string
  category: 'hot' | 'account' | 'settings'
  vote: 'useful' | 'not_useful'
  userId?: string | null
  username?: string | null
  appVersion?: string | null
  buildTime?: string | null
}) => {
  ensureOnlineForWrite('提交问题反馈')

  const payload = {
    question: input.question,
    category: input.category,
    vote: input.vote,
    user_id: input.userId || null,
    username: input.username || null,
    app_version: input.appVersion || null,
    build_time: input.buildTime || null,
  }

  const { error } = await (supabase as any)
    .from('help_question_feedback')
    .insert(payload)

  if (error) throw error
}