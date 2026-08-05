import { CommuteRecord } from './types';

export const DEFAULT_WORK_START_MINUTES = 9 * 60;
export const MAX_RELIABLE_TRIP_MINUTES = 4 * 60;

export interface MonthlyStats {
  monthRecords: CommuteRecord[];
  commuteArrivals: CommuteRecord[];
  returnArrivals: CommuteRecord[];
  earlyLeaves: CommuteRecord[];
  vacations: CommuteRecord[];
  sickDays: CommuteRecord[];
  absences: CommuteRecord[];
  activeDays: number;
  roundTripDays: number;
  timedTrips: number;
  avgCommuteDuration: number | null;
  avgReturnDuration: number | null;
  fastestTripDuration: number | null;
  challengingWeatherTrips: number;
  workStartMinutes: number;
  evaluatedCommutes: number;
  lateCount: number;
  lateRate: number | null;
  avgLateMinutes: number | null;
  incompleteCommutes: number;
  invalidArrivalTimes: number;
  excludedDurationCount: number;
}

function average(values: number[]) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

function reliableDurations(list: CommuteRecord[]) {
  return list
    .map((record) => record.duration_minutes)
    .filter(
      (value): value is number =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= MAX_RELIABLE_TRIP_MINUTES
    );
}

function durationIsExcluded(record: CommuteRecord) {
  const value = record.duration_minutes;
  return (
    typeof value === 'number' &&
    (!Number.isFinite(value) || value < 0 || value > MAX_RELIABLE_TRIP_MINUTES)
  );
}

function minutesOfDay(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

export function formatMinutesOfDay(minutes: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(
    normalized % 60
  ).padStart(2, '0')}`;
}

export function computeMonthlyStats(
  records: CommuteRecord[],
  now: Date,
  workStartMinutes = DEFAULT_WORK_START_MINUTES
): MonthlyStats {
  const monthRecords = records.filter((record) => {
    const [year, month] = record.date.split('-').map(Number);
    return year === now.getFullYear() && month === now.getMonth() + 1;
  });
  const commuteRecords = monthRecords.filter((record) => record.type === 'commute');
  const commuteArrivals = commuteRecords.filter((record) => Boolean(record.end_time));
  const returnArrivals = monthRecords.filter(
    (record) => record.type === 'return' && Boolean(record.end_time)
  );
  const commuteDates = new Set(commuteArrivals.map((record) => record.date));
  const returnDates = new Set(returnArrivals.map((record) => record.date));
  const commuteDurations = reliableDurations(commuteArrivals);
  const returnDurations = reliableDurations(returnArrivals);
  const allArrivals = [...commuteArrivals, ...returnArrivals];
  const allDurations = [...commuteDurations, ...returnDurations];

  const arrivalMinutes = commuteArrivals.map((record) =>
    record.end_time ? minutesOfDay(record.end_time) : null
  );
  const validArrivalMinutes = arrivalMinutes.filter(
    (value): value is number => value !== null
  );
  const lateMinutes = validArrivalMinutes
    .map((value) => value - workStartMinutes)
    .filter((value) => value > 0);

  return {
    monthRecords,
    commuteArrivals,
    returnArrivals,
    earlyLeaves: monthRecords.filter((record) => record.type === 'early_leave'),
    vacations: monthRecords.filter((record) => record.type === 'vacation'),
    sickDays: monthRecords.filter((record) => record.type === 'sick'),
    absences: monthRecords.filter((record) => record.type === 'absence'),
    activeDays: new Set(monthRecords.map((record) => record.date)).size,
    roundTripDays: [...commuteDates].filter((date) => returnDates.has(date)).length,
    timedTrips: allDurations.length,
    avgCommuteDuration: average(commuteDurations),
    avgReturnDuration: average(returnDurations),
    fastestTripDuration: allDurations.length ? Math.min(...allDurations) : null,
    challengingWeatherTrips: allArrivals.filter((record) =>
      ['caution', 'alert', 'danger'].includes(record.weather_condition ?? '')
    ).length,
    workStartMinutes,
    evaluatedCommutes: validArrivalMinutes.length,
    lateCount: lateMinutes.length,
    lateRate: validArrivalMinutes.length
      ? Math.round((lateMinutes.length / validArrivalMinutes.length) * 100)
      : null,
    avgLateMinutes: average(lateMinutes),
    incompleteCommutes: commuteRecords.filter((record) => !record.end_time).length,
    invalidArrivalTimes: arrivalMinutes.filter((value) => value === null).length,
    excludedDurationCount: allArrivals.filter(durationIsExcluded).length,
  };
}

export function getStatsFallbackComment(stats: MonthlyStats): string {
  if (stats.monthRecords.length === 0) {
    return '아직 이번 달 기록이 없어요. 첫 출근을 완료하면 흐름을 함께 살펴볼게요.';
  }
  if (stats.evaluatedCommutes === 0) {
    return '도착 시각이 있는 출근 기록이 없어 지각 여부는 아직 판단할 수 없어요.';
  }
  if (stats.lateCount === 0) {
    return `${formatMinutesOfDay(stats.workStartMinutes)} 기준으로 확인 가능한 출근 ${stats.evaluatedCommutes}건이 모두 제시간이었어요.`;
  }
  if (stats.lateRate !== null && stats.lateRate >= 50) {
    return `확인 가능한 출근 중 ${stats.lateRate}%가 기준 시각을 넘겼어요. 평균 ${stats.avgLateMinutes}분만 일찍 움직여도 흐름이 달라질 수 있어요.`;
  }
  return `확인 가능한 출근 ${stats.evaluatedCommutes}건 중 ${stats.lateCount}건이 늦었어요. 다음에는 평균 ${stats.avgLateMinutes}분 일찍 출발해 보세요.`;
}
