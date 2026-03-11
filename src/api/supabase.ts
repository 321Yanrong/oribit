import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/database'

const supabaseUrl = 'https://qoaqmbepnsqymxzpncyf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvYXFtYmVwbnNxeW14enBuY3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NTQ5NTMsImV4cCI6MjA4ODUzMDk1M30.dmQ5kVi2dGQHJ8QM7gDSRx8nNSSIfZ5jVbh22NLeBIc'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// ==================== 照片上传 ====================

export const uploadPhoto = async (
  userId: string,
  file: File
): Promise<string> => {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
  
  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })
  
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
  
  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })
  
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
  const { error: uploadError } = await supabase.storage
    .from('videos') // reuse videos bucket (supports audio too)
    .upload(fileName, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: mimeType,
    })
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
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ==================== 邀请码 & 虚拟好友绑定 ====================

export const saveInviteCode = async (userId: string, inviteCode: string): Promise<void> => {
  // 只在 invite_code 为空时写入，避免重复更新
  const { error } = await supabase
    .from('profiles')
    .update({ invite_code: inviteCode })
    .eq('id', userId)
    .is('invite_code', null)
  if (error) console.warn('保存邀请码失败:', error)
}

export const lookupProfileByInviteCode = async (inviteCode: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('invite_code', inviteCode)
    .single()
  if (error || !data) throw new Error('未找到该邀请码对应的用户，请确认对方已注册并开启了 Orbit')
  return data
}

export const bindVirtualFriend = async (friendshipId: string, realUserId: string): Promise<void> => {
  // 1. 更新 friendships.friend_id 为真实用户 UUID，状态改为 accepted
  const { error: e1 } = await supabase
    .from('friendships')
    .update({ friend_id: realUserId, status: 'accepted' })
    .eq('id', friendshipId)
  if (e1) throw e1

  // 2. 将所有打了该马甲标签的 memory_tags 更新为真实用户 ID
  const { error: e2 } = await supabase
    .from('memory_tags')
    .update({ user_id: realUserId, virtual_friend_id: null })
    .eq('virtual_friend_id', friendshipId)
  if (e2) throw e2
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
  audios?: string[]
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
  description?: string
) => {
  // 创建账单
  const { data: ledger, error: ledgerError } = await supabase
    .from('ledgers')
    .insert({
      creator_id: creatorId,
      total_amount: totalAmount,
      memory_id: memoryId,
      description: description || '日常消费',
      currency: 'RMB', 
      status: 'pending',
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
      participants:ledger_participants(
        *,
        user:profiles(*)
      )
    `)
    .or(`creator_id.eq.${userId},ledger_participants.user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data
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

// 通过邀请码直接添加已注册好友（不需要先建临时好友）
export const addRealFriendByCode = async (currentUserId: string, inviteCode: string): Promise<any> => {
  const profile = await lookupProfileByInviteCode(inviteCode);
  const { error } = await supabase
    .from('friendships')
    .insert({
      user_id: currentUserId,
      friend_id: profile.id,
      status: 'friends',
    });
  if (error) throw error;
  return profile;
};

// ==================== 记忆删除 ====================
export const deleteMemory = async (memoryId: string): Promise<void> => {
  // 先删关联标签，再删记忆本体
  await supabase.from('memory_tags').delete().eq('memory_id', memoryId);
  const { error } = await supabase.from('memories').delete().eq('id', memoryId);
  if (error) throw error;
};