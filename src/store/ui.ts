import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MemoryGroupBy = 'date' | 'city';

export interface MemoryStreamDraft {
  content: string;
  weather: string[];
  mood: string[];
  route: string;
  locationName: string;
  selectedLocation: {
    id: string;
    name: string;
    address: string;
    location: string;
    type: string;
  } | null;
  selectedFriends: string[];
  photos: string[];
  videos: string[];
  audios: string[];
  enableLedger: boolean;
  splitType: 'personal' | 'equal';
  memoryDate: string;
}

interface UIState {
  memoryStreamSearchQuery: string;
  memoryStreamFilterFriendIds: string[];
  memoryStreamGroupBy: MemoryGroupBy;
  memoryStreamDraft: MemoryStreamDraft | null;
  scrollPositions: Record<string, number>;
  memoryCommentReadMarkers: Record<string, string>;
  memoryCommentUnreadCount: number;
  likeReadMarkers: Record<string, number>;
  memoryLikeUnreadCount: number;
  memoryComposerRequestId: number;

  setMemoryStreamSearchQuery: (value: string) => void;
  setMemoryStreamFilterFriendIds: (value: string[]) => void;
  setMemoryStreamGroupBy: (value: MemoryGroupBy) => void;
  setMemoryStreamDraft: (value: MemoryStreamDraft) => void;
  clearMemoryStreamDraft: () => void;
  setScrollPosition: (pageKey: string, y: number) => void;
  markMemoryCommentsRead: (memoryId: string, lastSeenAt: string) => void;
  setMemoryCommentUnreadCount: (value: number) => void;
  markMemoryLikesRead: (memoryId: string, count: number) => void;
  setMemoryLikeUnreadCount: (value: number) => void;
  triggerMemoryComposerRequest: () => void;
  clearMemoryComposerRequest: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      memoryStreamSearchQuery: '',
      memoryStreamFilterFriendIds: [],
      memoryStreamGroupBy: 'date',
      memoryStreamDraft: null,
      scrollPositions: {},
      memoryCommentReadMarkers: {},
      memoryCommentUnreadCount: 0,
      likeReadMarkers: {},
      memoryLikeUnreadCount: 0,
      memoryComposerRequestId: 0,

      setMemoryStreamSearchQuery: (value) => set({ memoryStreamSearchQuery: value }),
      setMemoryStreamFilterFriendIds: (value) => set({ memoryStreamFilterFriendIds: value }),
      setMemoryStreamGroupBy: (value) => set({ memoryStreamGroupBy: value }),
      setMemoryStreamDraft: (value) => set({ memoryStreamDraft: value }),
      clearMemoryStreamDraft: () => set({ memoryStreamDraft: null }),
      setScrollPosition: (pageKey, y) =>
        set((state) => ({
          scrollPositions: {
            ...state.scrollPositions,
            [pageKey]: y,
          },
        })),
      markMemoryCommentsRead: (memoryId, lastSeenAt) =>
        set((state) => ({
          memoryCommentReadMarkers: {
            ...state.memoryCommentReadMarkers,
            [memoryId]: lastSeenAt,
          },
        })),
      setMemoryCommentUnreadCount: (value) => set({ memoryCommentUnreadCount: value }),
      markMemoryLikesRead: (memoryId, count) =>
        set((state) => ({
          likeReadMarkers: {
            ...state.likeReadMarkers,
            [memoryId]: count,
          },
        })),
      setMemoryLikeUnreadCount: (value) => set({ memoryLikeUnreadCount: value }),
      triggerMemoryComposerRequest: () => set({ memoryComposerRequestId: Date.now() }),
      clearMemoryComposerRequest: () => set({ memoryComposerRequestId: 0 }),
    }),
    {
      name: 'orbit-ui-state-v2',
      partialize: (state) => ({
        memoryStreamSearchQuery: state.memoryStreamSearchQuery,
        memoryStreamFilterFriendIds: state.memoryStreamFilterFriendIds,
        memoryStreamGroupBy: state.memoryStreamGroupBy,
        memoryStreamDraft: state.memoryStreamDraft,
        scrollPositions: state.scrollPositions,
        memoryCommentReadMarkers: state.memoryCommentReadMarkers,
        memoryCommentUnreadCount: state.memoryCommentUnreadCount,
        likeReadMarkers: state.likeReadMarkers,
        memoryLikeUnreadCount: state.memoryLikeUnreadCount,
      }),
    }
  )
);
