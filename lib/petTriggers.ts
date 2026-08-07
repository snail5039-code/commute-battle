import { CommuteRecord } from './types';
import { localDateKey } from './date';

export type PetTriggerKey =
  | 'praise_commute'
  | 'praise_return'
  | 'commute_late_1'
  | 'commute_late_2'
  | 'commute_late_3'
  | 'return_late_1'
  | 'return_late_2'
  | 'evening_checkin';

function avgMinutesOfDay(
  records: CommuteRecord[],
  type: 'commute' | 'return',
  fallback: number
) {
  const times = records
    .filter((r) => r.type === type && r.start_time)
    .slice(0, 10)
    .map((r) => {
      const d = new Date(r.start_time as string);
      return d.getHours() * 60 + d.getMinutes();
    });

  if (times.length === 0) return fallback;
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

export function detectPetTrigger(
  records: CommuteRecord[],
  now: Date
): PetTriggerKey | null {
  const day = now.getDay();
  if (day === 0 || day === 6) return null;

  const today = localDateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const commuteToday = records.find(
    (r) => r.date === today && r.type === 'commute'
  );
  const returnToday = records.find(
    (r) => r.date === today && r.type === 'return'
  );

  const avgCommuteStart = avgMinutesOfDay(records, 'commute', 8 * 60);
  const avgReturnStart = avgMinutesOfDay(records, 'return', 18 * 60);

  // 우선순위 순서로 후보를 나열하고, 아직 말하지 않은 것 중 첫 번째를 선택
  const candidates: PetTriggerKey[] = [];

  if (commuteToday?.end_time && commuteToday.is_on_time)
    candidates.push('praise_commute');
  if (returnToday?.end_time && returnToday.is_on_time)
    candidates.push('praise_return');

  if (!commuteToday) {
    if (nowMin > avgCommuteStart + 70) candidates.push('commute_late_3');
    if (nowMin > avgCommuteStart + 40) candidates.push('commute_late_2');
    if (nowMin > avgCommuteStart + 20) candidates.push('commute_late_1');
  }

  if (commuteToday?.end_time && !returnToday) {
    if (nowMin > avgReturnStart + 120) candidates.push('return_late_2');
    if (nowMin > avgReturnStart + 60) candidates.push('return_late_1');
  }

  if (returnToday?.end_time && nowMin >= 19 * 60)
    candidates.push('evening_checkin');

  return candidates.find((c) => !hasSpokenToday(c, now)) ?? null;
}

export function hasSpokenToday(trigger: PetTriggerKey, now: Date): boolean {
  if (typeof window === 'undefined') return true;
  const today = localDateKey(now);
  return localStorage.getItem(`pet_spoken_${today}_${trigger}`) === 'true';
}

export function markSpokenToday(trigger: PetTriggerKey, now: Date): void {
  if (typeof window === 'undefined') return;
  const today = localDateKey(now);
  localStorage.setItem(`pet_spoken_${today}_${trigger}`, 'true');
}

export function isPetQuiet(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('petQuiet') === 'true';
}
