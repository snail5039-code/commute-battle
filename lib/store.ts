import { create } from 'zustand';
import { User, CommuteState, CommuteRecord, WorkSchedule, WorkdayOverride } from './types';

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  startTime: '09:00',
  endTime: '18:00',
  overrides: {},
};

const WORK_SCHEDULE_KEY = 'commuteBattle.workSchedule';
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function workTimeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function isWorkdayOverride(value: unknown): value is WorkdayOverride {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WorkdayOverride>;
  return item.mode === 'office' || item.mode === 'remote' || item.mode === 'off';
}

export function workScheduleStorageKey(userId?: string) {
  return `${WORK_SCHEDULE_KEY}:${userId || 'local'}`;
}

export function normalizeWorkSchedule(value: unknown): WorkSchedule {
  if (!value || typeof value !== 'object') return { ...DEFAULT_WORK_SCHEDULE, overrides: {} };
  const candidate = value as Partial<WorkSchedule>;
  const overrides: WorkSchedule['overrides'] = {};
  if (candidate.overrides && typeof candidate.overrides === 'object') {
    Object.entries(candidate.overrides).forEach(([day, override]) => {
      const dayNumber = Number(day);
      if (dayNumber >= 0 && dayNumber <= 6 && isWorkdayOverride(override)) {
        overrides[dayNumber] = {
          mode: override.mode,
          startTime: override.startTime && TIME_PATTERN.test(override.startTime) ? override.startTime : undefined,
          endTime: override.endTime && TIME_PATTERN.test(override.endTime) ? override.endTime : undefined,
        };
      }
    });
  }
  return {
    startTime: candidate.startTime && TIME_PATTERN.test(candidate.startTime) ? candidate.startTime : DEFAULT_WORK_SCHEDULE.startTime,
    endTime: candidate.endTime && TIME_PATTERN.test(candidate.endTime) ? candidate.endTime : DEFAULT_WORK_SCHEDULE.endTime,
    overrides,
  };
}

export function loadWorkSchedule(userId?: string): WorkSchedule {
  if (typeof window === 'undefined') return normalizeWorkSchedule(null);
  try {
    return normalizeWorkSchedule(JSON.parse(localStorage.getItem(workScheduleStorageKey(userId)) || 'null'));
  } catch {
    return normalizeWorkSchedule(null);
  }
}

export function saveWorkSchedule(userId: string | undefined, schedule: WorkSchedule) {
  const normalized = normalizeWorkSchedule(schedule);
  if (typeof window !== 'undefined') localStorage.setItem(workScheduleStorageKey(userId), JSON.stringify(normalized));
  return normalized;
}

export function getWorkdaySchedule(schedule: WorkSchedule, date = new Date()) {
  const override = schedule.overrides[date.getDay()];
  return {
    mode: override?.mode ?? (date.getDay() === 0 || date.getDay() === 6 ? 'off' : 'office'),
    startTime: override?.startTime ?? schedule.startTime,
    endTime: override?.endTime ?? schedule.endTime,
  } as const;
}

interface AppStore {
  user: User | null;
  setUser: (user: User | null) => void;

  commuteState: CommuteState;
  setCommuteState: (state: CommuteState) => void;

  records: CommuteRecord[];
  setRecords: (records: CommuteRecord[]) => void;

  selectedDate: Date;
  setSelectedDate: (date: Date) => void;

  workSchedule: WorkSchedule;
  setWorkSchedule: (schedule: WorkSchedule) => void;
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

  workSchedule: DEFAULT_WORK_SCHEDULE,
  setWorkSchedule: (workSchedule) => set({ workSchedule }),
}));
