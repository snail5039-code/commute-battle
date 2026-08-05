import { CommuteRecord } from './types';

export type BadgeIconKey =
  | 'flag' | 'calendar' | 'timer' | 'storm' | 'door' | 'pill' | 'palm'
  | 'trophy' | 'route' | 'flame' | 'sunrise' | 'moon' | 'repeat' | 'sparkles'
  | 'zap' | 'crown' | 'cloudSun';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  hint: string;
  icon: BadgeIconKey;
  target: number;
  unit: string;
  rarity: BadgeRarity;
  hidden?: boolean;
  progress: (records: CommuteRecord[]) => number;
}

const completed = (records: CommuteRecord[], type: 'commute' | 'return') =>
  records.filter((record) => record.type === type && Boolean(record.end_time));

const countType = (records: CommuteRecord[], type: CommuteRecord['type']) =>
  records.filter((record) => record.type === type).length;

const datesFor = (records: CommuteRecord[], type: 'commute' | 'return') =>
  new Set(completed(records, type).map((record) => record.date));

const roundTripDays = (records: CommuteRecord[]) => {
  const commuteDates = datesFor(records, 'commute');
  return [...datesFor(records, 'return')].filter((date) => commuteDates.has(date)).length;
};

const localWeekday = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
};

const weekdayCount = (records: CommuteRecord[], weekday: number, type: 'commute' | 'return') =>
  completed(records, type).filter((record) => localWeekday(record.date) === weekday).length;

const distinctActiveDays = (records: CommuteRecord[]) => new Set(records.map((record) => record.date)).size;

const longestStreak = (records: CommuteRecord[]) => {
  const days = [...new Set(records.map((record) => record.date))].sort();
  let best = 0;
  let current = 0;
  let previous: number | undefined;
  for (const day of days) {
    const timestamp = new Date(`${day}T00:00:00`).getTime();
    current = previous !== undefined && timestamp - previous === 86_400_000 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = timestamp;
  }
  return best;
};

const fastTrips = (records: CommuteRecord[]) =>
  records.filter((record) =>
    (record.type === 'commute' || record.type === 'return') &&
    Boolean(record.end_time) && typeof record.duration_minutes === 'number' && record.duration_minutes <= 30
  ).length;

const totalCompletedTrips = (records: CommuteRecord[]) =>
  completed(records, 'commute').length + completed(records, 'return').length;

export const BADGES: BadgeDefinition[] = [
  { key: 'first_step', name: '첫 발자국', description: '첫 출근 여정을 무사히 마쳤어요.', hint: '출근 도착을 한 번 기록해 보세요.', icon: 'flag', target: 1, unit: '회', rarity: 'common', progress: (r) => completed(r, 'commute').length },
  { key: 'first_escape', name: '오늘도 탈출 성공', description: '첫 퇴근 여정을 완주했어요.', hint: '퇴근 도착을 한 번 기록해 보세요.', icon: 'door', target: 1, unit: '회', rarity: 'common', progress: (r) => completed(r, 'return').length },
  { key: 'round_trip', name: '완벽한 하루', description: '같은 날 출근과 퇴근을 모두 완료했어요.', hint: '하루의 출퇴근을 모두 기록해 보세요.', icon: 'repeat', target: 1, unit: '일', rarity: 'common', progress: roundTripDays },
  { key: 'week_builder', name: '꾸준한 기록가', description: '서로 다른 5일에 기록을 남겼어요.', hint: '기록하는 날을 차곡차곡 늘려 보세요.', icon: 'calendar', target: 5, unit: '일', rarity: 'common', progress: distinctActiveDays },
  { key: 'commute_10', name: '출근 루틴', description: '출근 도착을 10번 완료했어요.', hint: '아침 여정을 꾸준히 완료하세요.', icon: 'route', target: 10, unit: '회', rarity: 'rare', progress: (r) => completed(r, 'commute').length },
  { key: 'round_trip_10', name: '루틴 메이커', description: '왕복 출퇴근을 10일 완주했어요.', hint: '출근과 퇴근을 빠짐없이 기록하세요.', icon: 'flame', target: 10, unit: '일', rarity: 'rare', progress: roundTripDays },
  { key: 'monday_survivor', name: '월요병 생존자', description: '월요일 출근을 5번 완료했어요.', hint: '월요일도 힘차게 출발해 보세요.', icon: 'calendar', target: 5, unit: '회', rarity: 'rare', progress: (r) => weekdayCount(r, 1, 'commute') },
  { key: 'weather_runner', name: '날씨 돌파자', description: '궂은 날씨의 출근을 3번 이겨냈어요.', hint: '주의 이상의 날씨에도 안전하게 도착하세요.', icon: 'storm', target: 3, unit: '회', rarity: 'epic', progress: (r) => completed(r, 'commute').filter((record) => ['caution', 'alert', 'danger'].includes(record.weather_condition ?? '')).length },
  { key: 'early_leave', name: '빠른 귀환', description: '조퇴 기록을 처음 남겼어요.', hint: '몸과 마음에 휴식이 필요한 날도 있어요.', icon: 'sunrise', target: 1, unit: '회', rarity: 'common', progress: (r) => countType(r, 'early_leave') },
  { key: 'recovery', name: '회복도 업무다', description: '병가 기록을 처음 남겼어요.', hint: '잘 쉬는 것도 내일을 위한 루틴이에요.', icon: 'pill', target: 1, unit: '회', rarity: 'common', progress: (r) => countType(r, 'sick') },
  { key: 'freedom', name: '자유를 찾은 날', description: '휴가 기록을 처음 남겼어요.', hint: '일상에 쉼표를 찍어 보세요.', icon: 'palm', target: 1, unit: '회', rarity: 'common', progress: (r) => countType(r, 'vacation') },
  { key: 'veteran', name: '출퇴근 베테랑', description: '완료된 이동 기록을 100개 모았어요.', hint: '모든 여정은 베테랑으로 가는 경험치예요.', icon: 'trophy', target: 100, unit: '회', rarity: 'legendary', progress: totalCompletedTrips },
  { key: 'hidden_friday', name: '불금의 수호자', description: '금요일 퇴근을 5번 완수한 비밀 배지예요.', hint: '한 주의 마지막 평일, 퇴근길에 비밀이 있어요.', icon: 'sparkles', target: 5, unit: '회', rarity: 'epic', hidden: true, progress: (r) => weekdayCount(r, 5, 'return') },
  { key: 'hidden_speed', name: '30분 컷', description: '30분 이내 이동을 5번 완료한 비밀 배지예요.', hint: '효율적인 이동 시간이 열쇠일지도 몰라요.', icon: 'zap', target: 5, unit: '회', rarity: 'epic', hidden: true, progress: fastTrips },
  { key: 'hidden_streak', name: '일주일의 지배자', description: '7일 연속으로 기록을 남긴 비밀 배지예요.', hint: '하루도 놓치지 않는 꾸준함을 보여주세요.', icon: 'crown', target: 7, unit: '일', rarity: 'legendary', hidden: true, progress: longestStreak },
];

export function getBadgeProgress(badge: BadgeDefinition, records: CommuteRecord[]) {
  const current = badge.progress(records);
  const completedBadge = current >= badge.target;
  return {
    current,
    displayed: Math.min(current, badge.target),
    percent: Math.min(Math.round((current / badge.target) * 100), 100),
    completed: completedBadge,
    revealed: !badge.hidden || completedBadge,
  };
}

export function getBadgeSummary(records: CommuteRecord[]) {
  const progress = BADGES.map((badge) => ({ badge, ...getBadgeProgress(badge, records) }));
  return {
    progress,
    completed: progress.filter((item) => item.completed).length,
    total: BADGES.length,
  };
}
