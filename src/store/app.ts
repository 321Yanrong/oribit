import { create } from 'zustand';

interface AppState {
  resumeTrigger: number;
  triggerResume: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  resumeTrigger: 0,
  triggerResume: () => set({ resumeTrigger: Date.now() }),
}));
