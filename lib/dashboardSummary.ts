import type { User, WorkSchedule } from './types';
import { getFavoriteRoutes } from './routePreferences';
import { getWorkdaySchedule, workTimeToMinutes } from './store';

const ROUTE_HISTORY_KEY = 'commuteRouteLearning:v1';
const MAX_ROUTE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

interface StoredRouteChoice {
  direction: 'commute' | 'return';
  signature: string;
  totalTime: number;
  totalWalk: number;
  transferCount: number;
  selectedAt: number;
  source?: 'recent' | 'favorite';
}

export interface WorkClockSummary {
  currentTime: string;
  startTime: string;
  endTime: string;
  remainingLabel: string;
  modeLabel: string;
}

export interface ReturnRouteSummary {
  origin: string | null;
  destination: string | null;
  route: StoredRouteChoice | null;
}

function clock(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
}

function durationLabel(milliseconds: number) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

export function summarizeWorkClock(schedule: WorkSchedule, now = new Date()): WorkClockSummary {
  let workday = getWorkdaySchedule(schedule, now);
  let startMinutes = workTimeToMinutes(workday.startTime);
  let endMinutes = workTimeToMinutes(workday.endTime);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (endMinutes <= startMinutes && nowMinutes < endMinutes) {
    const previousDay = new Date(now);
    previousDay.setDate(previousDay.getDate() - 1);
    workday = getWorkdaySchedule(schedule, previousDay);
    startMinutes = workTimeToMinutes(workday.startTime);
    endMinutes = workTimeToMinutes(workday.endTime);
  }
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  if (end <= start) {
    if (nowMinutes < endMinutes) start.setDate(start.getDate() - 1);
    else end.setDate(end.getDate() + 1);
  }

  let remainingLabel = '근무일이 아닙니다';
  const modeLabel = workday.mode === 'remote' ? '재택 근무' : workday.mode === 'off' ? '휴무' : '사무실 근무';
  if (workday.mode !== 'off') {
    if (now < start) remainingLabel = `근무 시작까지 ${durationLabel(start.getTime() - now.getTime())}`;
    else if (now < end) remainingLabel = `퇴근까지 ${durationLabel(end.getTime() - now.getTime())}`;
    else remainingLabel = '설정한 퇴근 시간이 지났습니다';
  }
  return { currentTime: clock(now), startTime: workday.startTime, endTime: workday.endTime, remainingLabel, modeLabel };
}

function compactAddress(address?: string) {
  const normalized = address?.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  const parts = normalized.split(' ');
  return parts.slice(0, Math.min(3, parts.length)).join(' ');
}

function loadRecentReturnRoute(now = Date.now()): StoredRouteChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTE_HISTORY_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is StoredRouteChoice => {
      if (!item || typeof item !== 'object') return false;
      const route = item as Partial<StoredRouteChoice>;
      return route.direction === 'return'
        && typeof route.signature === 'string' && route.signature.length > 0 && route.signature.length <= 300
        && Number.isFinite(route.totalTime) && Number.isFinite(route.totalWalk)
        && Number.isFinite(route.transferCount) && Number.isFinite(route.selectedAt)
        && route.selectedAt! >= now - MAX_ROUTE_AGE_MS;
    }).sort((left, right) => right.selectedAt - left.selectedAt).map((route) => ({ ...route, source: 'recent' as const }))[0] ?? null;
  } catch { return null; }
}

export function summarizeReturnRoute(user: User): ReturnRouteSummary {
  const recent = loadRecentReturnRoute();
  const favorite = getFavoriteRoutes('return')[0];
  return {
    origin: compactAddress(user.work_address),
    destination: compactAddress(user.home_address),
    route: favorite ? { ...favorite, direction: 'return', selectedAt: favorite.savedAt, source: 'favorite' } : recent,
  };
}
