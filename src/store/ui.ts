import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MemoryGroupBy = 'date' | 'city';

export interface MemoryStreamDraft {
  content: string;
  weather: string;
  mood: string;
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

  setMemoryStreamSearchQuery: (value: string) => void;
  setMemoryStreamFilterFriendIds: (value: string[]) => void;
  setMemoryStreamGroupBy: (value: MemoryGroupBy) => void;
  setMemoryStreamDraft: (value: MemoryStreamDraft) => void;
  clearMemoryStreamDraft: () => void;
  setScrollPosition: (pageKey: string, y: number) => void;
  markMemoryCommentsRead: (memoryId: string, lastSeenAt: string) => void;
  setMemoryCommentUnreadCount: (value: number) => void;
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
      }),
    }
  )
);
