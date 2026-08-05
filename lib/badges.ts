import { CommuteRecord } from './types';

export type BadgeIconKey = 'flag' | 'calendar' | 'timer' | 'storm' | 'door' | 'pill' | 'palm' | 'trophy' | 'route' | 'flame' | 'sunrise' | 'moon' | 'repeat' | 'sparkles' | 'zap' | 'crown' | 'cloudSun';
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface BadgeDefinition { key: string; name: string; description: string; hint: string; icon: BadgeIconKey; target: number; unit: string; rarity: BadgeRarity; hidden?: boolean; progress: (records: CommuteRecord[]) => number; }

const completed = (records: CommuteRecord[], type: 'commute' | 'return') => records.filter((r) => r.type === type && Boolean(r.end_time));
const countType = (records: CommuteRecord[], type: CommuteRecord['type']) => records.filter((r) => r.type === type).length;
const datesFor = (records: CommuteRecord[], type: 'commute' | 'return') => new Set(completed(records, type).map((r) => r.date));
const roundTripDays = (records: CommuteRecord[]) => { const starts = datesFor(records, 'commute'); return [...datesFor(records, 'return')].filter((date) => starts.has(date)).length; };
const localWeekday = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const weekdayCount = (records: CommuteRecord[], day: number, type: 'commute' | 'return') => completed(records, type).filter((r) => localWeekday(r.date) === day).length;
const activeDays = (records: CommuteRecord[]) => new Set(records.map((r) => r.date)).size;
const fastTrips = (records: CommuteRecord[]) => records.filter((r) => (r.type === 'commute' || r.type === 'return') && Boolean(r.end_time) && typeof r.duration_minutes === 'number' && r.duration_minutes <= 30).length;

/** Vacation and sick days preserve a streak; absence explicitly resets it. */
export function longestCommuteStreak(records: CommuteRecord[]) {
  const byDate = new Map<string, CommuteRecord[]>();
  records.forEach((record) => byDate.set(record.date, [...(byDate.get(record.date) ?? []), record]));
  let current = 0; let best = 0;
  for (const day of [...byDate.keys()].sort()) {
    const dayRecords = byDate.get(day)!;
    if (dayRecords.some((r) => r.type === 'absence')) current = 0;
    else if (dayRecords.some((r) => r.type === 'commute' && Boolean(r.end_time))) { current += 1; best = Math.max(best, current); }
    // vacation/sick are intentionally neutral: preserve, but do not increase.
  }
  return best;
}

const streak = (target: number, rarity: BadgeRarity): BadgeDefinition => ({ key: `streak_${target}`, name: `${target}일 연속 출근`, description: `${target}번의 출근을 연속으로 완료했어요.`, hint: '휴가와 병가는 연속 기록을 보호하지만 결근하면 다시 시작해요.', icon: target >= 14 ? 'crown' : 'flame', target, unit: '일', rarity, progress: longestCommuteStreak });

export const BADGES: BadgeDefinition[] = [
  { key: 'first_step', name: '첫 발자국', description: '첫 출근 여정을 완료했어요.', hint: '출근 일정을 한 번 완료해 보세요.', icon: 'flag', target: 1, unit: '회', rarity: 'common', progress: (r) => completed(r, 'commute').length },
  { key: 'first_escape', name: '오늘도 탈출 성공', description: '첫 퇴근 여정을 완료했어요.', hint: '퇴근 일정을 한 번 기록해 보세요.', icon: 'door', target: 1, unit: '회', rarity: 'common', progress: (r) => completed(r, 'return').length },
  { key: 'round_trip', name: '완벽한 하루', description: '하루 출퇴근을 모두 완료했어요.', hint: '같은 날 출근과 퇴근을 기록하세요.', icon: 'repeat', target: 1, unit: '일', rarity: 'common', progress: roundTripDays },
  { key: 'week_builder', name: '꾸준한 기록가', description: '서로 다른 5일에 기록을 남겼어요.', hint: '기록하는 날을 차근차근 늘려 보세요.', icon: 'calendar', target: 5, unit: '일', rarity: 'common', progress: activeDays },
  { key: 'commute_10', name: '출근 루틴', description: '출근 일정을 10번 완료했어요.', hint: '아침 여정을 꾸준히 완료하세요.', icon: 'route', target: 10, unit: '회', rarity: 'rare', progress: (r) => completed(r, 'commute').length },
  { key: 'round_trip_10', name: '루틴 메이커', description: '왕복 출퇴근을 10일 완주했어요.', hint: '출근과 퇴근을 빠짐없이 기록하세요.', icon: 'flame', target: 10, unit: '일', rarity: 'rare', progress: roundTripDays },
  { key: 'monday_survivor', name: '월요병 생존자', description: '월요일 출근을 5번 완료했어요.', hint: '월요일도 힘차게 출발해 보세요.', icon: 'calendar', target: 5, unit: '회', rarity: 'rare', progress: (r) => weekdayCount(r, 1, 'commute') },
  { key: 'weather_runner', name: '궂은 날 돌파', description: '주의 날씨에 3번 출근했어요.', hint: '날씨가 나쁜 날에는 특히 안전하게 이동하세요.', icon: 'storm', target: 3, unit: '회', rarity: 'epic', progress: (r) => completed(r, 'commute').filter((x) => ['caution', 'alert', 'danger'].includes(x.weather_condition ?? '')).length },
  { key: 'early_leave', name: '빠른 귀가', description: '조퇴 기록을 처음 남겼어요.', hint: '휴식이 필요한 날도 있어요.', icon: 'sunrise', target: 1, unit: '회', rarity: 'common', progress: (r) => countType(r, 'early_leave') },
  { key: 'recovery', name: '회복도 업무', description: '병가 기록을 처음 남겼어요.', hint: '잘 쉬는 것도 중요한 루틴이에요.', icon: 'pill', target: 1, unit: '회', rarity: 'common', progress: (r) => countType(r, 'sick') },
  { key: 'freedom', name: '자유를 찾은 날', description: '휴가 기록을 처음 남겼어요.', hint: '일상의 쉼표를 챙겨 보세요.', icon: 'palm', target: 1, unit: '회', rarity: 'common', progress: (r) => countType(r, 'vacation') },
  streak(3, 'common'), streak(7, 'rare'), streak(14, 'epic'), streak(30, 'legendary'),
  { key: 'veteran', name: '출퇴근 베테랑', description: '완료한 이동 기록을 100개 모았어요.', hint: '모든 여정은 경험치가 됩니다.', icon: 'trophy', target: 100, unit: '회', rarity: 'legendary', progress: (r) => completed(r, 'commute').length + completed(r, 'return').length },
  { key: 'hidden_friday', name: '불금의 수호자', description: '금요일 퇴근을 5번 완료했어요.', hint: '한 주의 마지막 평일에 비밀이 있어요.', icon: 'sparkles', target: 5, unit: '회', rarity: 'epic', hidden: true, progress: (r) => weekdayCount(r, 5, 'return') },
  { key: 'hidden_speed', name: '30분 컷', description: '30분 이내 이동을 5번 완료했어요.', hint: '효율적인 이동 시간을 찾아보세요.', icon: 'zap', target: 5, unit: '회', rarity: 'epic', hidden: true, progress: fastTrips },
];

export function getBadgeProgress(badge: BadgeDefinition, records: CommuteRecord[]) { const current = badge.progress(records); const done = current >= badge.target; return { current, displayed: Math.min(current, badge.target), percent: Math.min(Math.round(current / badge.target * 100), 100), completed: done, revealed: !badge.hidden || done }; }
export function getBadgeSummary(records: CommuteRecord[]) { const progress = BADGES.map((badge) => ({ badge, ...getBadgeProgress(badge, records) })); return { progress, completed: progress.filter((x) => x.completed).length, total: BADGES.length }; }
