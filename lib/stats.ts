import { CommuteRecord } from './types';

export interface MonthlyStats {
  commuteArrivals: CommuteRecord[];
  returnArrivals: CommuteRecord[];
  earlyLeaves: CommuteRecord[];
  vacations: CommuteRecord[];
  absences: CommuteRecord[];
  onTimeCommutes: CommuteRecord[];
  lateCommutes: number;
  avgCommuteDuration: number | null;
  avgReturnDuration: number | null;
  survivalRate: number;
}

function avgDuration(list: CommuteRecord[]) {
  const durations = list
    .map((r) => r.duration_minutes)
    .filter((d): d is number => typeof d === 'number');
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}

export function computeMonthlyStats(
  records: CommuteRecord[],
  now: Date
): MonthlyStats {
  const monthRecords = records.filter((r) => {
    const d = new Date(r.date);
    return (
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    );
  });

  const commuteArrivals = monthRecords.filter(
    (r) => r.type === 'commute' && r.end_time
  );
  const returnArrivals = monthRecords.filter(
    (r) => r.type === 'return' && r.end_time
  );
  const earlyLeaves = monthRecords.filter((r) => r.type === 'early_leave');
  const vacations = monthRecords.filter(
    (r) => r.type === 'vacation' || r.type === 'sick'
  );
  const absences = monthRecords.filter((r) => r.type === 'absence');
  const onTimeCommutes = commuteArrivals.filter((r) => r.is_on_time);
  const lateCommutes = commuteArrivals.length - onTimeCommutes.length;

  const daysElapsed = now.getDate();
  const activeDays = new Set(monthRecords.map((r) => r.date)).size;
  const survivalRate =
    daysElapsed > 0
      ? Math.min(Math.round((activeDays / daysElapsed) * 100), 100)
      : 0;

  return {
    commuteArrivals,
    returnArrivals,
    earlyLeaves,
    vacations,
    absences,
    onTimeCommutes,
    lateCommutes,
    avgCommuteDuration: avgDuration(commuteArrivals),
    avgReturnDuration: avgDuration(returnArrivals),
    survivalRate,
  };
}
