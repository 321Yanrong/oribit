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
  if (!currentUser) return;
  if (!isRealUUID(currentUser.id)) return;

  // 1. 发起联表查询
  // 使用 as any 是因为你之前删除了外键关联，TS 插件可能无法自动识别关系
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
    console.error("拉取好友失败:", error.message);
    return;
  }

  if (data) {
    // 2. ✨ 数据清洗与包装 (Data Mapping)
    const formattedFriends: Friend[] = data.map((item: any) => {
      // 判断是否为马甲：没有关联的 friend 资料，或者 friend_id 为空
      const isVirtual = !item.friend;

      const resolvedFriendId = isVirtual
        ? `temp-${item.id}`
        : item.friend_id || item.friend?.id || `temp-${item.id}`;
      const friendProfile = item.friend;

      return {
        id: item.id,            // 这里的 id 是 friendships 表的主键 (text)
        user_id: item.user_id,
        friend_id: item.friend_id, // 真实用户为 UUID，马甲为 null
        friend_name: item.friend_name,
        remark: item.remark,
        status: item.status,
        created_at: item.created_at,
        
        // ✨ 统一包装名为 friend 的对象，让 UI 组件不需要做任何判断
        friend: {
          id: resolvedFriendId,
          // real_username: 真实账号名/马甲名，只在详情页展示
          real_username: isVirtual ? (item.friend_name || '马甲好友') : friendProfile?.username ?? '密友',
          // username: 优先显示备注，没有备注才用真实名
          username: item.remark || (isVirtual ? (item.friend_name || '马甲好友') : friendProfile?.username ?? '密友'),
          avatar_url: isVirtual 
            ? `https://api.dicebear.com/9.x/adventurer/svg?seed=${item.friend_name || item.id}&backgroundColor=ffdfbf` 
            : (() => {
                const raw = friendProfile?.avatar_url ?? '';
                if (raw && raw.includes('hair=') && raw.includes(',')) {
                  const m = raw.match(/[?&]seed=([^&,]+)/);
                  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${m ? m[1] : item.id}`;
                }
                return raw || `https://api.dicebear.com/9.x/adventurer/svg?seed=guest`;
              })()
        }
      };
    });

    set({ friends: formattedFriends });
  }
},
  addFriend: async (friendshipData) => {
    const { error } = await supabase.from('friendships').insert([friendshipData]);
    if (!error) await get().fetchFriends();
  },
  deleteFriend: async (friendshipId) => {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (!error) await get().fetchFriends();
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
      })
      .eq('id', id);
    if (error) throw error;

    // 2. 同步 memory_tags：先删除旧的，再插入新的
    await supabase.from('memory_tags').delete().eq('memory_id', id);

    const taggedFriends: string[] = updatedData.tagged_friends || [];
    const realTags = taggedFriends
      .filter((fid: string) => !fid.startsWith('temp-'))
      .map((fid: string) => ({ memory_id: id, user_id: fid }));
    const virtualTags = taggedFriends
      .filter((fid: string) => fid.startsWith('temp-'))
      .map((fid: string) => ({ memory_id: id, virtual_friend_id: fid.replace('temp-', '') }));
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
  fetchLedgers: async () => {
    const userId = useUserStore.getState().currentUser?.id;
    if (!userId || !isRealUUID(userId)) return;
    try {
      const { getLedgers } = await import('../api/supabase');
      const data = await getLedgers(userId);
      const seen = new Set<string>();
      const unique = ((data || []) as any[]).filter((l: any) => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });
      set({ ledgers: unique });
    } catch (e) {
      console.error('fetchLedgers error:', e);
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