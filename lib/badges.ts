import { CommuteRecord } from './types';

export type BadgeIconKey =
  | 'flag'
  | 'calendar'
  | 'timer'
  | 'storm'
  | 'door'
  | 'pill'
  | 'palm'
  | 'trophy'
  | 'route'
  | 'flame'
  | 'sunrise'
  | 'moon'
  | 'repeat'
  | 'sparkles';

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  icon: BadgeIconKey;
  target: number;
  unit: string;
  progress: (records: CommuteRecord[]) => number;
}

const completed = (records: CommuteRecord[], type: 'commute' | 'return') =>
  records.filter((record) => record.type === type && Boolean(record.end_time));

const countType = (records: CommuteRecord[], type: CommuteRecord['type']) =>
  records.filter((record) => record.type === type).length;

const completedDates = (records: CommuteRecord[], type: 'commute' | 'return') =>
  new Set(completed(records, type).map((record) => record.date));

const roundTripDays = (records: CommuteRecord[]) => {
  const commuteDates = completedDates(records, 'commute');
  return [...completedDates(records, 'return')].filter((date) => commuteDates.has(date)).length;
};

const weekdayCount = (records: CommuteRecord[], weekday: number) =>
  completed(records, 'commute').filter((record) => {
    const [year, month, day] = record.date.split('-').map(Number);
    return new Date(year, month - 1, day).getDay() === weekday;
  }).length;

const timedTrips = (records: CommuteRecord[]) =>
  records.filter(
    (record) =>
      (record.type === 'commute' || record.type === 'return') &&
      record.end_time &&
      typeof record.duration_minutes === 'number'
  );

const distinctActiveDays = (records: CommuteRecord[]) =>
  new Set(records.map((record) => record.date)).size;

export const BADGES: BadgeDefinition[] = [
  { key: 'first_step', name: '첫 발자국', description: '출근을 처음 완료해요', icon: 'flag', target: 1, unit: '회', progress: (r) => completed(r, 'commute').length },
  { key: 'first_escape', name: '첫 번째 탈출', description: '퇴근을 처음 완료해요', icon: 'door', target: 1, unit: '회', progress: (r) => completed(r, 'return').length },
  { key: 'round_trip', name: '완벽한 하루', description: '같은 날 출근과 퇴근을 모두 완료해요', icon: 'repeat', target: 1, unit: '일', progress: roundTripDays },
  { key: 'week_builder', name: '일주일 루틴', description: '서로 다른 5일에 기록을 남겨요', icon: 'calendar', target: 5, unit: '일', progress: distinctActiveDays },
  { key: 'commute_10', name: '출근 워밍업', description: '출근을 10회 완료해요', icon: 'route', target: 10, unit: '회', progress: (r) => completed(r, 'commute').length },
  { key: 'return_10', name: '퇴근 수집가', description: '퇴근을 10회 완료해요', icon: 'moon', target: 10, unit: '회', progress: (r) => completed(r, 'return').length },
  { key: 'round_trip_10', name: '루틴 메이커', description: '출근과 퇴근을 모두 기록한 날이 10일', icon: 'flame', target: 10, unit: '일', progress: roundTripDays },
  { key: 'monday_survivor', name: '월요일의 생존자', description: '월요일 출근을 5회 완료해요', icon: 'calendar', target: 5, unit: '회', progress: (r) => weekdayCount(r, 1) },
  { key: 'friday_finisher', name: '금요일 피니셔', description: '금요일 퇴근을 5회 완료해요', icon: 'sparkles', target: 5, unit: '회', progress: (r) => completed(r, 'return').filter((record) => { const [y, m, d] = record.date.split('-').map(Number); return new Date(y, m - 1, d).getDay() === 5; }).length },
  { key: 'timed_10', name: '시간의 기록자', description: '소요 시간이 담긴 이동 기록을 10회 모아요', icon: 'timer', target: 10, unit: '회', progress: (r) => timedTrips(r).length },
  { key: 'weather_runner', name: '날씨 돌파대', description: '주의 이상의 날씨에서 이동을 3회 완료해요', icon: 'storm', target: 3, unit: '회', progress: (r) => completed(r, 'commute').filter((record) => ['caution', 'alert', 'danger'].includes(record.weather_condition ?? '')).length },
  { key: 'early_leave', name: '빠른 귀환', description: '조퇴 기록을 처음 남겨요', icon: 'sunrise', target: 1, unit: '회', progress: (r) => countType(r, 'early_leave') },
  { key: 'recovery', name: '회복도 업무다', description: '병가 기록을 처음 남겨요', icon: 'pill', target: 1, unit: '회', progress: (r) => countType(r, 'sick') },
  { key: 'freedom', name: '자유를 찾은 자', description: '휴가 기록을 처음 남겨요', icon: 'palm', target: 1, unit: '회', progress: (r) => countType(r, 'vacation') },
  { key: 'veteran', name: '출퇴근 베테랑', description: '완료한 이동 기록을 100회 모아요', icon: 'trophy', target: 100, unit: '회', progress: (r) => completed(r, 'commute').length + completed(r, 'return').length },
];

export function getBadgeProgress(badge: BadgeDefinition, records: CommuteRecord[]) {
  const current = badge.progress(records);
  return { current, displayed: Math.min(current, badge.target), percent: Math.min(Math.round((current / badge.target) * 100), 100), completed: current >= badge.target };
}
