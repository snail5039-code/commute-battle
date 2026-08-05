import { assessDataQuality, QualityResult } from './dataQuality';
import { CommuteRecord } from './types';

export const DEFAULT_WORK_START_MINUTES = 9 * 60;

export interface WeeklyReport {
  sampleSize: number;
  averageMinutes: number | null;
  variabilityMinutes: number | null;
  stableWeekday: string | null;
  lateCauseCandidates: string[];
  actions: string[];
}

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
  quality: QualityResult;
  weekly: WeeklyReport;
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function minutesOfDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getHours() * 60 + date.getMinutes();
}

export function formatMinutesOfDay(minutes: number) {
  const normalized = Math.max(0, Math.min(1439, minutes));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function weeklyReport(records: CommuteRecord[], now: Date, workStartMinutes: number): WeeklyReport {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 6);
  const recent = records.filter((record) => {
    const date = new Date(`${record.date}T12:00:00`);
    return record.type === 'commute' && date >= from && date <= now;
  });
  const durations = recent.map((r) => r.duration_minutes!).filter(Number.isFinite);
  const mean = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const variability = mean === null ? null : Math.round(Math.sqrt(durations.reduce((sum, value) => sum + (value - mean) ** 2, 0) / durations.length));
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const byDay = new Map<number, number[]>();
  recent.forEach((record) => {
    const day = new Date(`${record.date}T12:00:00`).getDay();
    byDay.set(day, [...(byDay.get(day) ?? []), record.duration_minutes!]);
  });
  const stable = [...byDay.entries()].filter(([, values]) => values.length).sort((a, b) => {
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    return spread(a[1]) - spread(b[1]);
  })[0];
  const late = recent.filter((r) => r.end_time && (minutesOfDay(r.end_time) ?? 0) > workStartMinutes);
  const wetLate = late.filter((r) => ['caution', 'alert', 'danger'].includes(r.weather_condition ?? '')).length;
  const causes: string[] = [];
  if (late.length && wetLate / late.length >= 0.4) causes.push(`비·악천후 동반 ${wetLate}/${late.length}건`);
  if (mean !== null && variability !== null && variability >= Math.max(8, mean * 0.2)) causes.push(`이동시간 변동 폭 ${variability}분`);
  if (late.length && !causes.length) causes.push('출발 여유시간 부족 가능성');
  const actions: string[] = [];
  if (late.length) actions.push(`평소보다 ${Math.max(5, Math.round((variability ?? 5) / 5) * 5)}분 일찍 출발`);
  if (wetLate) actions.push('비 예보일에는 도보가 적은 경로 확인');
  if (!actions.length) actions.push('현재 출발 루틴 유지');
  return { sampleSize: recent.length, averageMinutes: average(durations), variabilityMinutes: variability, stableWeekday: stable ? `${weekdays[stable[0]]}요일` : null, lateCauseCandidates: causes, actions };
}

export function computeMonthlyStats(records: CommuteRecord[], now: Date, workStartMinutes = DEFAULT_WORK_START_MINUTES): MonthlyStats {
  const monthInput = records.filter((record) => {
    const [year, month] = record.date.split('-').map(Number);
    return year === now.getFullYear() && month === now.getMonth() + 1;
  });
  const quality = assessDataQuality(monthInput);
  const monthRecords = quality.validRecords;
  const commuteArrivals = monthRecords.filter((r) => r.type === 'commute');
  const returnArrivals = monthRecords.filter((r) => r.type === 'return');
  const commuteDates = new Set(commuteArrivals.map((r) => r.date));
  const returnDates = new Set(returnArrivals.map((r) => r.date));
  const commuteDurations = commuteArrivals.map((r) => r.duration_minutes!);
  const returnDurations = returnArrivals.map((r) => r.duration_minutes!);
  const arrivals = commuteArrivals.map((r) => minutesOfDay(r.end_time!)).filter((v): v is number => v !== null);
  const lateMinutes = arrivals.map((v) => v - workStartMinutes).filter((v) => v > 0);
  return {
    monthRecords, commuteArrivals, returnArrivals,
    earlyLeaves: monthRecords.filter((r) => r.type === 'early_leave'),
    vacations: monthRecords.filter((r) => r.type === 'vacation'), sickDays: monthRecords.filter((r) => r.type === 'sick'), absences: monthRecords.filter((r) => r.type === 'absence'),
    activeDays: new Set(monthRecords.map((r) => r.date)).size,
    roundTripDays: [...commuteDates].filter((date) => returnDates.has(date)).length,
    timedTrips: commuteDurations.length + returnDurations.length,
    avgCommuteDuration: average(commuteDurations), avgReturnDuration: average(returnDurations),
    fastestTripDuration: [...commuteDurations, ...returnDurations].length ? Math.min(...commuteDurations, ...returnDurations) : null,
    challengingWeatherTrips: [...commuteArrivals, ...returnArrivals].filter((r) => ['caution', 'alert', 'danger'].includes(r.weather_condition ?? '')).length,
    workStartMinutes, evaluatedCommutes: arrivals.length, lateCount: lateMinutes.length,
    lateRate: arrivals.length ? Math.round(lateMinutes.length / arrivals.length * 100) : null,
    avgLateMinutes: average(lateMinutes), quality,
    weekly: weeklyReport(assessDataQuality(records).validRecords, now, workStartMinutes),
  };
}

export function getStatsFallbackComment(stats: MonthlyStats) {
  if (!stats.monthRecords.length) return '아직 분석할 수 있는 기록이 없어요. 출퇴근을 완료하면 리포트를 만들게요.';
  if (!stats.evaluatedCommutes) return '도착 시각을 확인할 수 있는 출근 기록이 없어요.';
  if (!stats.lateCount) return `${formatMinutesOfDay(stats.workStartMinutes)} 기준, 확인 가능한 출근 ${stats.evaluatedCommutes}건이 모두 정시였어요.`;
  return `확인 가능한 출근 ${stats.evaluatedCommutes}건 중 ${stats.lateCount}건이 늦었어요. 평균 ${stats.avgLateMinutes}분 여유를 더 두어 보세요.`;
}
