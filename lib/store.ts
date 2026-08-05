import { create } from 'zustand';
import { User, CommuteState, CommuteRecord } from './types';

interface AppStore {
  user: User | null;
  setUser: (user: User | null) => void;

  commuteState: CommuteState;
  setCommuteState: (state: CommuteState) => void;

  records: CommuteRecord[];
  setRecords: (records: CommuteRecord[]) => void;

  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
}

export const useStore = create<AppStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  commuteState: { status: null },
  setCommuteState: (commuteState) => set({ commuteState }),

  records: [],
  setRecords: (records) => set({ records }),

  selectedDate: new Date(),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
}));
