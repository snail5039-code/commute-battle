import { assessDataQuality, QualityResult } from './dataQuality';
import { CommuteRecord, WorkSchedule } from './types';
import { DEFAULT_WORK_SCHEDULE, getWorkdaySchedule, workTimeToMinutes } from './store';

export type StatsPeriod = 'week' | 'month' | 'year';
export interface TrendPoint { date: string; label: string; arrivalMinutes: number | null; durationMinutes: number | null; }
export interface BreakdownItem { label: string; count: number; averageMinutes?: number; }
export interface PeriodRange { start: Date; end: Date; label: string; }
export interface WeeklyReport { sampleSize: number; averageMinutes: number | null; variabilityMinutes: number | null; stableWeekday: string | null; lateCauseCandidates: string[]; actions: string[]; }
export interface MonthlyStats { monthRecords: CommuteRecord[]; commuteArrivals: CommuteRecord[]; returnArrivals: CommuteRecord[]; earlyLeaves: CommuteRecord[]; vacations: CommuteRecord[]; sickDays: CommuteRecord[]; absences: CommuteRecord[]; activeDays: number; roundTripDays: number; timedTrips: number; avgCommuteDuration: number | null; avgReturnDuration: number | null; fastestTripDuration: number | null; challengingWeatherTrips: number; workStartMinutes: number; evaluatedCommutes: number; lateCount: number; lateRate: number | null; avgLateMinutes: number | null; quality: QualityResult; weekly: WeeklyReport; }
export interface PeriodStats extends MonthlyStats { range: PeriodRange; previousRange: PeriodRange; trend: TrendPoint[]; weatherBreakdown: BreakdownItem[] | null; transportBreakdown: BreakdownItem[] | null; }

const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
function minutesOfDay(value?: string) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.getHours() * 60 + date.getMinutes(); }
export function formatMinutesOfDay(minutes: number) { const n = Math.max(0, Math.min(1439, minutes)); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
const dateAt = (value: string) => new Date(`${value}T12:00:00`);
const dayStart = (date: Date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const dayEnd = (date: Date) => { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; };

export function getPeriodRange(period: StatsPeriod, anchor: Date, offset = 0): PeriodRange {
  const d = new Date(anchor);
  if (period === 'week') {
    d.setDate(d.getDate() + offset * 7);
    const start = dayStart(d);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = dayEnd(start);
    end.setDate(end.getDate() + 6);
    return { start, end, label: `${start.getMonth() + 1}.${start.getDate()} ~ ${end.getMonth() + 1}.${end.getDate()}` };
  }
  if (period === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    const end = dayEnd(new Date(start.getFullYear(), start.getMonth() + 1, 0));
    return { start, end, label: `${start.getFullYear()}년 ${start.getMonth() + 1}월` };
  }
  const start = new Date(d.getFullYear() + offset, 0, 1);
  const end = dayEnd(new Date(start.getFullYear(), 11, 31));
  return { start, end, label: `${start.getFullYear()}년` };
}

// 하루에 출근 기록이 여러 번이면(퇴근 후 일이 생겨 재출근 등) 가장 이른 기록만 그날의
// 실제 출근으로 보고 지각 평가 대상에 넣는다. 그렇지 않으면 재출근이 늦은 시각 도착으로
// 잡혀 지각률에 잘못 반영된다.
function firstCommutePerDay(records: CommuteRecord[]) {
  const byDate = new Map<string, CommuteRecord>();
  for (const record of records) {
    const existing = byDate.get(record.date);
    if (!existing || new Date(record.start_time!).getTime() < new Date(existing.start_time!).getTime()) {
      byDate.set(record.date, record);
    }
  }
  return [...byDate.values()];
}

function rawField(record: CommuteRecord, names: string[]) {
  const raw = record as unknown as Record<string, unknown>;
  for (const name of names) if (typeof raw[name] === 'string' && raw[name]) return String(raw[name]);
  return null;
}

function breakdown(records: CommuteRecord[], fields: string[], empty: string[] = []) {
  const rows = records.map((record) => ({ label: rawField(record, fields), duration: record.duration_minutes })).filter((item) => item.label && !empty.includes(item.label));
  if (!rows.length) return null;
  const groups = new Map<string, { count: number; durations: number[] }>();
  rows.forEach(({ label, duration }) => {
    const item = groups.get(label!) ?? { count: 0, durations: [] };
    item.count += 1;
    if (typeof duration === 'number') item.durations.push(duration);
    groups.set(label!, item);
  });
  return [...groups].map(([label, item]) => ({ label, count: item.count, averageMinutes: average(item.durations) ?? undefined })).sort((a, b) => b.count - a.count);
}

function weeklyReport(records: CommuteRecord[]): WeeklyReport {
  const durations = records.filter((record) => record.type === 'commute').map((record) => record.duration_minutes!).filter(Number.isFinite);
  const mean = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const variability = mean === null ? null : Math.round(Math.sqrt(durations.reduce((sum, value) => sum + (value - mean) ** 2, 0) / durations.length));
  return {
    sampleSize: durations.length,
    averageMinutes: average(durations),
    variabilityMinutes: variability,
    stableWeekday: null,
    lateCauseCandidates: [],
    actions: [durations.length ? '이동시간 추이를 확인하고 여유 출발 시간을 조정해 보세요.' : '기록이 쌓이면 맞춤 제안을 드릴게요.'],
  };
}

export function computePeriodStats(records: CommuteRecord[], period: StatsPeriod, anchor: Date, schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE, excludedIds: Set<string> = new Set()): PeriodStats {
  const range = getPeriodRange(period, anchor);
  const previousRange = getPeriodRange(period, anchor, -1);
  const input = records.filter((record) => {
    const date = dateAt(record.date);
    return date >= range.start && date <= range.end && !excludedIds.has(record.id);
  });
  const quality = assessDataQuality(input);
  const monthRecords = quality.validRecords;
  const commuteArrivals = monthRecords.filter((record) => record.type === 'commute');
  const returnArrivals = monthRecords.filter((record) => record.type === 'return');
  const commuteDurations = commuteArrivals.map((record) => record.duration_minutes!).filter(Number.isFinite);
  const returnDurations = returnArrivals.map((record) => record.duration_minutes!).filter(Number.isFinite);
  const evaluations = firstCommutePerDay(commuteArrivals).map((record) => {
    const arrival = minutesOfDay(record.end_time);
    const day = getWorkdaySchedule(schedule, dateAt(record.date));
    return arrival === null || day.mode !== 'office' ? null : arrival - workTimeToMinutes(day.startTime);
  }).filter((value): value is number => value !== null);
  const lateMinutes = evaluations.filter((value) => value > 0);
  const commuteDates = new Set(commuteArrivals.map((record) => record.date));
  const returnDates = new Set(returnArrivals.map((record) => record.date));
  const trend = commuteArrivals.map((record) => ({
    date: record.date,
    label: new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(dateAt(record.date)),
    arrivalMinutes: minutesOfDay(record.end_time),
    durationMinutes: record.duration_minutes ?? null,
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    range,
    previousRange,
    monthRecords,
    commuteArrivals,
    returnArrivals,
    earlyLeaves: monthRecords.filter((record) => record.type === 'early_leave'),
    vacations: monthRecords.filter((record) => record.type === 'vacation'),
    sickDays: monthRecords.filter((record) => record.type === 'sick'),
    absences: monthRecords.filter((record) => record.type === 'absence'),
    activeDays: new Set(monthRecords.map((record) => record.date)).size,
    roundTripDays: [...commuteDates].filter((date) => returnDates.has(date)).length,
    timedTrips: commuteDurations.length + returnDurations.length,
    avgCommuteDuration: average(commuteDurations),
    avgReturnDuration: average(returnDurations),
    fastestTripDuration: [...commuteDurations, ...returnDurations].length ? Math.min(...commuteDurations, ...returnDurations) : null,
    challengingWeatherTrips: [...commuteArrivals, ...returnArrivals].filter((record) => ['caution', 'alert', 'danger'].includes(record.weather_condition ?? '')).length,
    workStartMinutes: workTimeToMinutes(schedule.startTime),
    evaluatedCommutes: evaluations.length,
    lateCount: lateMinutes.length,
    lateRate: evaluations.length ? Math.round(lateMinutes.length / evaluations.length * 100) : null,
    avgLateMinutes: average(lateMinutes),
    quality,
    weekly: weeklyReport(monthRecords),
    trend,
    weatherBreakdown: breakdown([...commuteArrivals, ...returnArrivals], ['weather_condition'], ['normal', 'clear']),
    transportBreakdown: breakdown([...commuteArrivals, ...returnArrivals], ['transport_mode', 'transportation', 'mode']),
  };
}

export function computeMonthlyStats(records: CommuteRecord[], now: Date, workStartMinutes = 540): MonthlyStats {
  return computePeriodStats(records, 'month', now, { ...DEFAULT_WORK_SCHEDULE, startTime: formatMinutesOfDay(workStartMinutes) });
}

export function comparisonPercent(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round((current - previous) / previous * 100);
}

/** 펫이 직접 말하는 느낌의 반말 3줄(칭찬/관찰-잔소리/응원)로 구성. AI 응답이 오기 전까지 보여주는 기본값이기도 함. */
export function getStatsFallbackComment(stats: MonthlyStats): string[] {
  if (!stats.monthRecords.length) return ['아직 통계에 반영된 기록이 없어!', '출근하고 도착까지 찍어줘야 내가 분석할 수 있어.', '오늘부터 같이 시작해볼까?'];
  if (!stats.evaluatedCommutes) return ['도착 시간이 있는 출근 기록이 더 필요해.', '출근만 누르고 도착을 안 찍으면 통계에 안 잡혀.', '다음엔 도착까지 꼭 눌러줘!'];
  if (!stats.lateCount) return [`평가 가능한 출근 ${stats.evaluatedCommutes}건이 전부 정시 도착이야!`, '오늘은 출근을 잘했네?? 잘했어!', '이 페이스 그대로만 가자, 나 믿지?'];
  return [`출근 ${stats.evaluatedCommutes}건 중 ${stats.lateCount}건이 지각이었어.`, `평균 ${stats.avgLateMinutes}분씩 늦었더라, 다음엔 조금만 더 일찍 나와보자!`, '그래도 꾸준히 기록한 거 칭찬해!'];
}
