import { CommuteRecord } from './types';

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
}

function durations(list: CommuteRecord[]) {
  return list.map((record) => record.duration_minutes).filter((value): value is number => typeof value === 'number' && value >= 0);
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export function computeMonthlyStats(records: CommuteRecord[], now: Date): MonthlyStats {
  const monthRecords = records.filter((record) => {
    const [year, month] = record.date.split('-').map(Number);
    return year === now.getFullYear() && month === now.getMonth() + 1;
  });
  const commuteArrivals = monthRecords.filter((record) => record.type === 'commute' && record.end_time);
  const returnArrivals = monthRecords.filter((record) => record.type === 'return' && record.end_time);
  const commuteDates = new Set(commuteArrivals.map((record) => record.date));
  const returnDates = new Set(returnArrivals.map((record) => record.date));
  const commuteDurations = durations(commuteArrivals);
  const returnDurations = durations(returnArrivals);
  const allDurations = [...commuteDurations, ...returnDurations];

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
    challengingWeatherTrips: [...commuteArrivals, ...returnArrivals].filter((record) => ['caution', 'alert', 'danger'].includes(record.weather_condition ?? '')).length,
  };
}

export function getStatsFallbackComment(stats: MonthlyStats): string {
  if (stats.monthRecords.length === 0) return '아직 이번 달 기록이 없어요. 첫 이동을 남기면 여기서 패턴을 함께 찾아볼게요.';
  if (stats.roundTripDays >= 5) return `출근과 퇴근을 모두 기록한 날이 ${stats.roundTripDays}일이에요. 탄탄한 기록 루틴이 만들어지고 있어요!`;
  if (stats.challengingWeatherTrips > 0) return `궂은 날씨에도 ${stats.challengingWeatherTrips}번 이동을 마쳤어요. 오늘도 안전한 이동이 가장 중요해요.`;
  if (stats.timedTrips >= 3 && stats.avgCommuteDuration !== null) return `소요 시간이 담긴 이동이 ${stats.timedTrips}회 쌓였어요. 이번 달 평균 출근 시간은 ${stats.avgCommuteDuration}분이에요.`;
  if (stats.commuteArrivals.length || stats.returnArrivals.length) return `이번 달 완료한 이동이 ${stats.commuteArrivals.length + stats.returnArrivals.length}회예요. 기록이 쌓일수록 더 선명한 패턴을 보여드릴게요.`;
  return `이번 달 ${stats.activeDays}일의 생활 기록이 있어요. 이동 완료 기록도 남기면 소요 시간 흐름을 볼 수 있어요.`;
}
