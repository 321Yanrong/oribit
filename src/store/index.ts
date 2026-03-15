import { create } from 'zustand';
import { User, Memory, Ledger, MapPin, Location, Settlement } from '../types';
import { getMemories } from '../api/supabase';
import { supabase } from '../api/supabase';

// 仅接受真实 UUID（demo 模式用 'demo-user'，不能发给 Supabase）
const isRealUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// ==========================================
// 1. 类型定义
// ==========================================
export interface Friend {
  id: string;
  user_id: string;
  friend_id: string | null;
  friend_name?: string;
  remark?: string;
  status: string;
  friend?: {                
    id: string;
    username: string;      // 优先显示备注，无备注时为真实名
    real_username: string; // 永远是真实账号名/马甲名，用于详情页
    avatar_url: string;
  };
  created_at: string;
}

const sanitizeAvatarUrl = (raw: string | null | undefined, seed: string) => {
  const fallback = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}`;
  if (!raw) return fallback;
  if (raw.includes('hair=') && raw.includes(',')) {
    const match = raw.match(/[?&]seed=([^&,]+)/);
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${match ? match[1] : seed}`;
  }
  return raw;
};

const mapFriendRecord = (item: any): Friend => {
  const isVirtual = !item.friend;
  const resolvedFriendId = isVirtual
    ? `temp-${item.id}`
    : item.friend_id || item.friend?.id || `temp-${item.id}`;
  const friendProfile = item.friend;

  const avatarUrl = isVirtual
    ? `https://api.dicebear.com/9.x/adventurer/svg?seed=${item.friend_name || item.id}&backgroundColor=ffdfbf`
    : sanitizeAvatarUrl(friendProfile?.avatar_url ?? '', friendProfile?.id || item.id);

  return {
    id: item.id,
    user_id: item.user_id,
    friend_id: item.friend_id,
    friend_name: item.friend_name,
    remark: item.remark,
    status: item.status,
    created_at: item.created_at,
    friend: {
      id: resolvedFriendId,
      real_username: isVirtual ? (item.friend_name || '马甲好友') : friendProfile?.username ?? '密友',
      username: item.remark || (isVirtual ? (item.friend_name || '马甲好友') : friendProfile?.username ?? '密友'),
      avatar_url: avatarUrl,
    },
  };
};

// ==========================================
// 2. 用户 Store (包含马甲逻辑)
// ==========================================
interface UserState {
  currentUser: any | null;
  friends: Friend[];
  pendingRequests: any[];
  setCurrentUser: (user: any | null) => void;
  fetchFriends: () => Promise<void>;
  fetchPendingRequests: () => Promise<void>;
  addFriend: (friendshipData: any) => Promise<void>;
  deleteFriend: (friendshipId: string) => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  currentUser: null,
  friends: [],
  pendingRequests: [],
  setCurrentUser: (user) => set({ currentUser: user }),
  fetchPendingRequests: async () => {
    const { currentUser } = get();
    if (!currentUser || !isRealUUID(currentUser.id)) return;
    const { getPendingFriendRequests } = await import('../api/supabase');
    const data = await getPendingFriendRequests(currentUser.id);
    set({ pendingRequests: data });
  },
  fetchFriends: async () => {
    const { currentUser } = get();
    if (!currentUser || !isRealUUID(currentUser.id)) return;

    const { data, error } = await supabase
      .from('friendships')
      .select(`
        *,
        friend:friend_id (
          id,
          username,
          avatar_url
        )
      `)
      .eq('user_id', currentUser.id)
      .in('status', ['accepted', 'virtual']) as any;

    if (error) {
      console.error('拉取好友失败:', error.message);
      return;
    }

    if (data) {
      const mapped = data.map(mapFriendRecord);
      const dedupedMap = new Map<string, Friend>();

      mapped.forEach((item) => {
        const key = item.friend?.id || item.friend_id || item.id;
        const prev = dedupedMap.get(key);
        if (!prev) {
          dedupedMap.set(key, item);
          return;
        }

        // 优先保留有备注的记录，避免把用户手动备注丢掉
        const prevHasRemark = Boolean(prev.remark && prev.remark.trim());
        const currHasRemark = Boolean(item.remark && item.remark.trim());
        if (!prevHasRemark && currHasRemark) {
          dedupedMap.set(key, item);
        }
      });

      set({ friends: Array.from(dedupedMap.values()) });
    }
  },
  addFriend: async (friendshipData) => {
    const { currentUser } = get();
    if (!currentUser) {
      throw new Error('请先登录后再添加好友');
    }
    if (!isRealUUID(currentUser.id)) {
      throw new Error('当前是演示模式，演示数据不会保存，请先登录真实账号');
    }
    const { data, error } = await supabase
      .from('friendships')
      .insert([friendshipData])
      .select(`
        *,
        friend:friend_id (
          id,
          username,
          avatar_url
        )
      `)
      .single();
    if (error) {
      console.error('添加好友失败:', error.message);
      throw new Error(error.message || '添加好友失败');
    }
    const formatted = mapFriendRecord(data);
    set((state) => ({ friends: [formatted, ...state.friends] }));
  },
  deleteFriend: async (friendshipId) => {
    const { deleteFriendship } = await import('../api/supabase');
    await deleteFriendship(friendshipId);
    await get().fetchFriends();
  },
}));

export const getUserById = (userId: string): any | undefined => {
  const state = useUserStore.getState();
  if (state.currentUser?.id === userId) return state.currentUser;
  const friendship = state.friends.find(f => f.friend_id === userId || f.id === userId);
  return friendship?.friend;
};

// ==========================================
// 3. 记忆 Store
// ==========================================
interface MemoryState {
  memories: any[];
  selectedMemory: Memory | null;
  selectedFriendId: string | null;
  setSelectedFriendId: (friendId: string | null) => void;
  fetchMemories: () => Promise<void>;
  addMemory: (memory: Memory) => void;
  editMemory: (id: string, updatedData: any) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  memories: [],
  selectedMemory: null,
  selectedFriendId: null,
  setSelectedFriendId: (friendId) => set({ selectedFriendId: friendId }),
  fetchMemories: async () => {
    const userId = useUserStore.getState().currentUser?.id; 
    if (!userId || !isRealUUID(userId)) return;
    const data = await getMemories(userId);
    set({ memories: data || [] });
  },
  addMemory: (memory) => set((state) => ({ memories: [memory, ...state.memories] })),
  editMemory: async (id, updatedData) => {
    // 1. 更新 memories 表基本字段
    const { supabase } = await import('../api/supabase');
    const { error } = await supabase
      .from('memories')
      .update({
        content: updatedData.content,
        memory_date: updatedData.memory_date,
        location_id: updatedData.location_id,
        photos: updatedData.photos,
        videos: updatedData.videos || [],
        audios: updatedData.audios || [],
        has_ledger: !!updatedData.has_ledger,
      })
      .eq('id', id);
    if (error) throw error;

    // 2. 同步 memory_tags：先删除旧的，再插入新的
    await supabase.from('memory_tags').delete().eq('memory_id', id);

    const ownerId = useUserStore.getState().currentUser?.id;
    const taggedFriends: string[] = updatedData.tagged_friends || [];
    const realTags = taggedFriends
      .filter((fid: string) => !fid.startsWith('temp-'))
      .map((fid: string) => ({ memory_id: id, user_id: fid, owner_id: ownerId }));
    const virtualTags = taggedFriends
      .filter((fid: string) => fid.startsWith('temp-'))
      .map((fid: string) => ({ memory_id: id, virtual_friend_id: fid.replace('temp-', ''), owner_id: ownerId }));
    const allTags = [...realTags, ...virtualTags];
    if (allTags.length > 0) {
      await supabase.from('memory_tags').insert(allTags);
    }

    // 3. 重新拉取最新数据，刷新列表显示
    const userId = useUserStore.getState().currentUser?.id;
    if (userId && isRealUUID(userId)) {
      const { getMemories } = await import('../api/supabase');
      const data = await getMemories(userId);
      set({ memories: data || [] });
    }
  },
  deleteMemory: async (id) => {
    const { deleteMemory: deleteMemoryApi } = await import('../api/supabase');
    await deleteMemoryApi(id);
    set((state) => ({ memories: state.memories.filter((m) => m.id !== id) }));
  },
}));

// ==========================================
// 4. 地图 Store (✨ 刚才漏掉的就在这里！)
// ==========================================
interface MapState {
  pins: MapPin[];
  selectedPin: MapPin | null;
  setSelectedPin: (pin: MapPin | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  pins: [],
  selectedPin: null,
  setSelectedPin: (pin) => set({ selectedPin: pin }),
}));

// ==========================================
// 5. 账单 Store
// ==========================================
interface LedgerState {
  ledgers: Ledger[];
  fetchLedgers: () => Promise<void>;
  addLedger: (ledger: Ledger) => void;
  deleteLedger: (id: string) => Promise<void>;
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  ledgers: [],
  _fetchLedgersInFlight: null as Promise<void> | null,
  fetchLedgers: async () => {
    const userId = useUserStore.getState().currentUser?.id;
    if (!userId || !isRealUUID(userId)) return;
    const inFlight = (get() as any)._fetchLedgersInFlight as Promise<void> | null;
    if (inFlight) return inFlight;
    try {
      const task = (async () => {
        const { getLedgers } = await import('../api/supabase');
        const data = await getLedgers(userId);
        const seen = new Set<string>();
        const unique = ((data || []) as any[]).filter((l: any) => {
          if (seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        });
        set({ ledgers: unique });
      })();
      set({ _fetchLedgersInFlight: task } as any);
      await task;
    } catch (e) {
      console.error('fetchLedgers error:', e);
    } finally {
      set({ _fetchLedgersInFlight: null } as any);
    }
  },
  addLedger: (ledger) => set((state) => ({ ledgers: [...state.ledgers, ledger] })),
  deleteLedger: async (id) => {
    const { deleteLedger: deleteApi } = await import('../api/supabase');
    await deleteApi(id);
    set((state) => ({ ledgers: state.ledgers.filter((l) => l.id !== id) }));
  },
}));

// ==========================================
// 6. 导航/页面 Store
// ==========================================
export const useNavStore = create<{ currentPage: string; setCurrentPage: (page: string) => void }>((set) => ({
  currentPage: 'map',
  setCurrentPage: (page) => set({ currentPage: page }),
}));

// 为了兼容你可能在其他地方使用的 usePageStore
export const usePageStore = useNavStore;