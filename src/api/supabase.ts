import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/database'

const supabaseUrl = 'https://qoaqmbepnsqymxzpncyf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvYXFtYmVwbnNxeW14enBuY3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NTQ5NTMsImV4cCI6MjA4ODUzMDk1M30.dmQ5kVi2dGQHJ8QM7gDSRx8nNSSIfZ5jVbh22NLeBIc'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

const UPLOAD_TIMEOUT_MS = 45000

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = UPLOAD_TIMEOUT_MS): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('上传超时，请检查网络后重试')), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise])
}

// ==================== 照片上传 ====================

export const uploadPhoto = async (
  userId: string,
  file: File
): Promise<string> => {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
  
  const { error: uploadError } = await withTimeout(
    supabase.storage
      .from('photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })
  )
  
  if (uploadError) throw uploadError
  
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
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/avatar.${fileExt}`
  
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true, // 允许覆盖旧头像
    })
  
  if (uploadError) throw uploadError
  
  // 获取公开 URL
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName)
  
  // 更新用户 profile
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId)
  
  if (updateError) throw updateError
  
  return publicUrl
}

// ==================== 认证相关 ====================

export const signUp = async (email: string, password: string, username: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
      },
    },
  })
  
  if (error) throw error
  
  // Profile 会由数据库触发器自动创建
  // 触发器会从 auth.users.raw_user_meta_data 中读取 username
  
  return data
}

export const signIn = async (email: string, password: string) => {
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

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ==================== 邀请码 & 虚拟好友绑定 ====================

export const saveInviteCode = async (userId: string, inviteCode: string): Promise<void> => {
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

export const bindVirtualFriend = async (friendshipId: string, realUserId: string): Promise<void> => {
  // 0. 先查出发起方（A 的 user_id），用于创建反向记录
  const { data: existing, error: fetchErr } = await supabase
    .from('friendships')
    .select('user_id')
    .eq('id', friendshipId)
    .single();
  if (fetchErr) throw fetchErr;
  const ownerUserId = existing.user_id;

  // 1. 更新 friendships.friend_id 为真实用户 UUID，状态改为 accepted
  const { error: e1 } = await supabase
    .from('friendships')
    .update({ friend_id: realUserId, status: 'accepted' })
    .eq('id', friendshipId)
  if (e1) throw e1

  // 2. 为真实用户 B 创建反向记录（B → A），让 B 的好友列表也能看到 A
  const { error: e3 } = await supabase
    .from('friendships')
    .insert({ user_id: realUserId, friend_id: ownerUserId, status: 'accepted' });
  if (e3 && (e3 as any).code !== '23505') {
    // 23505 = unique violation（已存在），可忽略；其余报错也只警告不中断
    console.warn('[bindVirtualFriend] 创建反向关系失败:', (e3 as any).message);
  }

  // 3. 将所有打了该马甲标签的 memory_tags 更新为真实用户 ID
  // virtual_friend_id 存的是 friendships.id
  const { error: e2 } = await supabase
    .from('memory_tags')
    .update({ user_id: realUserId, virtual_friend_id: null })
    .eq('virtual_friend_id', friendshipId)
    .select()
  if (e2) {
    // virtual_friend_id 列不存在时会报错 — 说明需要先运行 SQL进行数据库升级
    console.error('[bindVirtualFriend] memory_tags 同步失败（可能缺 virtual_friend_id 列）:', e2.message);
    // 不抛出，允许 friendships 绑定步骤已成功
  } else {
    console.log(`[bindVirtualFriend] memory_tags 同步完成`);
  }
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

  const formattedData = allMemories.map((memory: any) => ({
    ...memory,
    is_owner: memory.user_id === userId,
    tagged_friends: [...new Set(
      (memory.tags?.map((t: any) =>
        t.user_id ? t.user_id : (t.virtual_friend_id ? `temp-${t.virtual_friend_id}` : null)
      ).filter(Boolean) || []) as string[]
    )]
  }));

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
      .map(friendId => ({ memory_id: memory.id, user_id: friendId }))

    // 虚拟好友：存 virtual_friend_id = friendships.id（去掉 temp- 前缀）
    const virtualTags = (taggedFriends || [])
      .filter(id => id.startsWith('temp-'))
      .map(id => ({ memory_id: memory.id, virtual_friend_id: id.replace('temp-', '') }))

    const allTags = [...realTags, ...virtualTags]
    if (allTags.length > 0) {
      const { error: tagsError } = await supabase.from('memory_tags').insert(allTags)
      if (tagsError) throw tagsError
    }
  }
  
  return memory
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
  expenseType: 'shared' | 'personal' = 'shared'
) => {
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

export const updateLedger = async (
  ledgerId: string,
  creatorId: string,
  totalAmount: number,
  participants: { userId: string; amount: number }[],
  memoryId?: string,
  expenseType: 'shared' | 'personal' = 'shared'
) => {
  // 1. 更新账单主表
  const { error: ledgerError } = await supabase
    .from('ledgers')
    .update({
      total_amount: totalAmount,
      memory_id: memoryId,
      expense_type: expenseType,
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
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);
  if (error) throw error;
};

// 好友备注更新
export const updateFriendRemark = async (friendshipId: string, remark: string): Promise<void> => {
  const { error } = await supabase
    .from('friendships')
    .update({ remark: remark || null } as any)
    .eq('id', friendshipId)
  if (error) throw error
}

// 通过邀请码发送好友申请（对方需要接受）
export const addRealFriendByCode = async (currentUserId: string, inviteCode: string): Promise<any> => {
  const profile = await lookupProfileByInviteCode(inviteCode);

  if (profile.id === currentUserId) throw new Error('不能添加自己为好友');

  // 检查是否已经是好友或已发过申请
  const { data: existing } = await supabase
    .from('friendships')
    .select('id, status')
    .or(`and(user_id.eq.${currentUserId},friend_id.eq.${profile.id}),and(user_id.eq.${profile.id},friend_id.eq.${currentUserId})`)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'accepted') throw new Error(`已经是 ${profile.username} 的好友了`);
    if (existing.status === 'pending') throw new Error('好友申请已发送，等待对方确认');
  }

  const { error } = await supabase
    .from('friendships')
    .insert({
      user_id: currentUserId,
      friend_id: profile.id,
      status: 'pending',
    });
  if (error) throw error;
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

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  return data.map((r: any) => ({
    ...r,
    requester: profileMap.get(r.user_id) || null,
  }));
};

// 接受好友申请：把发起方记录改为 accepted，再插一条反向记录
export const acceptFriendRequest = async (friendshipId: string, requesterId: string, currentUserId: string): Promise<void> => {
  // 1. 更新申请方那条记录
  const { error: e1 } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  if (e1) throw e1;

  // 2. 创建反向记录（让双方都能在自己的好友列表看到对方）
  const { error: e2 } = await supabase
    .from('friendships')
    .insert({ user_id: currentUserId, friend_id: requesterId, status: 'accepted' });
  if (e2 && e2.code !== '23505') throw e2; // 23505 = unique violation → already exists, OK
};

// 拒绝 / 忽略好友申请
export const rejectFriendRequest = async (friendshipId: string): Promise<void> => {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);
  if (error) throw error;
};

// ==================== 记忆删除 ====================
export const deleteMemory = async (memoryId: string): Promise<void> => {
  // 先删关联标签，再删记忆本体
  await supabase.from('memory_tags').delete().eq('memory_id', memoryId);
  const { error } = await supabase.from('memories').delete().eq('id', memoryId);
  if (error) throw error;
};