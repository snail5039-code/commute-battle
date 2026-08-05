import { CommuteRecord } from './types';

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
  arrivalTime: Date
): boolean {
  const arrivalMin = arrivalTime.getHours() * 60 + arrivalTime.getMinutes();
  const avg = avgMinutesOfDay(records, 'commute', 'end_time');
  const threshold = avg !== null ? avg + 5 : 9 * 60;
  return arrivalMin <= threshold;
}

// 퇴근: 평소 출발시간(없으면 18:00) 기준 ±15분 이내 출발이면 "칼퇴"
export function isReturnOnTime(
  records: CommuteRecord[],
  departureTime: Date
): boolean {
  const departureMin =
    departureTime.getHours() * 60 + departureTime.getMinutes();
  const avg = avgMinutesOfDay(records, 'return', 'start_time');
  const threshold = avg !== null ? avg : 18 * 60;
  return Math.abs(departureMin - threshold) <= 15;
}
