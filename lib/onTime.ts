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

// 출근: 공식 출근시간을 지키면 항상 정시. 평소 도착시간이 그보다 늦으면 +5분까지는 봐준다
// (개인 평균은 오직 완화 방향으로만 작동 — 평소보다 일찍/정시에 왔다고 지각 처리되면 안 됨).
export function isCommuteOnTime(
  records: CommuteRecord[],
  arrivalTime: Date,
  schedule?: WorkSchedule
): boolean {
  const arrivalMin = arrivalTime.getHours() * 60 + arrivalTime.getMinutes();
  const configuredStart = minutes(scheduleFor(records, arrivalTime, schedule).startTime);
  const avg = avgMinutesOfDay(records, 'commute', 'end_time');
  const threshold = avg !== null ? Math.max(avg + 5, configuredStart) : configuredStart;
  return arrivalMin <= threshold;
}

// 퇴근: 공식 퇴근시간에 나가면 항상 "칼퇴". 평소 출발시간 기준 ±15분도 인정
// (두 기준 중 하나라도 만족하면 정시 — 개인 평균이 늦다고 공식 시간 준수가 손해 보면 안 됨).
export function isReturnOnTime(
  records: CommuteRecord[],
  departureTime: Date,
  schedule?: WorkSchedule
): boolean {
  const departureMin =
    departureTime.getHours() * 60 + departureTime.getMinutes();
  const configuredEnd = minutes(scheduleFor(records, departureTime, schedule).endTime);
  const avg = avgMinutesOfDay(records, 'return', 'start_time');
  if (avg === null) return Math.abs(departureMin - configuredEnd) <= 15;
  const lower = Math.min(configuredEnd, avg) - 15;
  const upper = Math.max(configuredEnd, avg) + 15;
  return departureMin >= lower && departureMin <= upper;
}
