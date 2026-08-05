import { CommuteRecord } from './types';

export type PetTriggerKey = 'commute_late' | 'return_late' | 'evening_checkin';

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

  const today = now.toISOString().split('T')[0];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const commuteToday = records.find(
    (r) => r.date === today && r.type === 'commute'
  );
  const returnToday = records.find(
    (r) => r.date === today && r.type === 'return'
  );

  const avgCommuteStart = avgMinutesOfDay(records, 'commute', 8 * 60);
  const avgReturnStart = avgMinutesOfDay(records, 'return', 18 * 60);

  if (!commuteToday && nowMin > avgCommuteStart + 20) return 'commute_late';
  if (commuteToday?.end_time && !returnToday && nowMin > avgReturnStart + 60)
    return 'return_late';
  if (returnToday?.end_time && nowMin >= 19 * 60) return 'evening_checkin';

  return null;
}

export function hasSpokenToday(trigger: PetTriggerKey, now: Date): boolean {
  if (typeof window === 'undefined') return true;
  const today = now.toISOString().split('T')[0];
  return localStorage.getItem(`pet_spoken_${today}_${trigger}`) === 'true';
}

export function markSpokenToday(trigger: PetTriggerKey, now: Date): void {
  if (typeof window === 'undefined') return;
  const today = now.toISOString().split('T')[0];
  localStorage.setItem(`pet_spoken_${today}_${trigger}`, 'true');
}

export function isPetQuiet(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('petQuiet') === 'true';
}
