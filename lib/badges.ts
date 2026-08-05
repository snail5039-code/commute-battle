import { CommuteRecord } from './types';

export type BadgeIconKey =
  | 'flag'
  | 'calendar'
  | 'timer'
  | 'storm'
  | 'door'
  | 'pill'
  | 'palm'
  | 'trophy';

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  icon: BadgeIconKey;
  target: number;
  progress: (records: CommuteRecord[]) => number;
}

const arrivedReturns = (records: CommuteRecord[]) =>
  records.filter((r) => r.type === 'return' && r.end_time);

const arrivedCommutes = (records: CommuteRecord[]) =>
  records.filter((r) => r.type === 'commute' && r.end_time);

const mondayCommutes = (records: CommuteRecord[]) =>
  arrivedCommutes(records).filter((r) => new Date(r.date).getDay() === 1);

const longestOnTimeStreak = (records: CommuteRecord[], type: 'commute' | 'return') => {
  const sorted = records
    .filter((r) => r.type === type && r.end_time)
    .sort((a, b) => a.date.localeCompare(b.date));

  let longest = 0;
  let current = 0;
  for (const r of sorted) {
    if (r.is_on_time) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
};

export const BADGES: BadgeDefinition[] = [
  {
    key: 'first_escape',
    name: '첫 번째 탈출',
    description: '첫 퇴근 완료',
    icon: 'flag',
    target: 1,
    progress: (records) => Math.min(arrivedReturns(records).length, 1),
  },
  {
    key: 'monday_survivor',
    name: '월요일의 생존자',
    description: '월요일 출근 5회',
    icon: 'calendar',
    target: 5,
    progress: (records) => mondayCommutes(records).length,
  },
  {
    key: 'no_late',
    name: '지각 없는 인간',
    description: '정시 출근 10회 연속',
    icon: 'timer',
    target: 10,
    progress: (records) => longestOnTimeStreak(records, 'commute'),
  },
  {
    key: 'rain_breaker',
    name: '폭우 돌파',
    description: '강수량 10mm/h 이상인 날 출근 완료',
    icon: 'storm',
    target: 1,
    progress: (records) =>
      arrivedCommutes(records).some((r) => r.weather_condition === 'danger')
        ? 1
        : 0,
  },
  {
    key: 'early_bird_leave',
    name: '칼퇴 수호자',
    description: '정시 퇴근 5회',
    icon: 'door',
    target: 5,
    progress: (records) =>
      arrivedReturns(records).filter((r) => r.is_on_time).length,
  },
  {
    key: 'recovery',
    name: '회복도 업무다',
    description: '병가 최초 사용',
    icon: 'pill',
    target: 1,
    progress: (records) =>
      records.some((r) => r.type === 'sick') ? 1 : 0,
  },
  {
    key: 'freedom',
    name: '자유를 찾은 자',
    description: '휴가 최초 사용',
    icon: 'palm',
    target: 1,
    progress: (records) =>
      records.some((r) => r.type === 'vacation') ? 1 : 0,
  },
  {
    key: 'escape_expert',
    name: '탈출 전문가',
    description: '퇴근 누적 100회',
    icon: 'trophy',
    target: 100,
    progress: (records) => arrivedReturns(records).length,
  },
];
