import { CommuteRecord, WorkSchedule } from './types';
import { getWorkdaySchedule, loadWorkSchedule } from './store';

function minutes(time: string) {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

function scheduleFor(records: CommuteRecord[], date: Date, schedule?: WorkSchedule) {
  const resolved = schedule ?? loadWorkSchedule(records[0]?.user_id);
  return getWorkdaySchedule(resolved, date);
}

function avgMinutesOfDay(
  records: CommuteRecord[],
  type: 'commute' | 'return',
  field: 'start_time' | 'end_time'
): number | null {
  const times = records
    .filter((r) => r.type === type && r[field])
    .slice(0, 10)
    .map((r) => {
      const d = new Date(r[field] as string);
      return d.getHours() * 60 + d.getMinutes();
    });

  if (times.length === 0) return null;
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

// 출근: 평소 도착시간(없으면 09:00) + 5분 이내 도착이면 정시
export function isCommuteOnTime(
  records: CommuteRecord[],
  arrivalTime: Date,
  schedule?: WorkSchedule
): boolean {
  const arrivalMin = arrivalTime.getHours() * 60 + arrivalTime.getMinutes();
  const configuredStart = minutes(scheduleFor(records, arrivalTime, schedule).startTime);
  const avg = avgMinutesOfDay(records, 'commute', 'end_time');
  const threshold = avg !== null ? Math.min(avg + 5, configuredStart) : configuredStart;
  return arrivalMin <= threshold;
}

// 퇴근: 평소 출발시간(없으면 18:00) 기준 ±15분 이내 출발이면 "칼퇴"
export function isReturnOnTime(
  records: CommuteRecord[],
  departureTime: Date,
  schedule?: WorkSchedule
): boolean {
  const departureMin =
    departureTime.getHours() * 60 + departureTime.getMinutes();
  const configuredEnd = minutes(scheduleFor(records, departureTime, schedule).endTime);
  const avg = avgMinutesOfDay(records, 'return', 'start_time');
  const threshold = avg !== null ? Math.max(avg, configuredEnd) : configuredEnd;
  return Math.abs(departureMin - threshold) <= 15;
}
