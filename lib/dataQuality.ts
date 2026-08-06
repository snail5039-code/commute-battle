import { CommuteRecord } from './types';

export type DataQualityReason = 'duplicate' | 'incomplete' | 'invalid_duration' | 'gps_jump';
export interface QualityIssue { record: CommuteRecord; reasons: DataQualityReason[]; }
export interface QualityResult { validRecords: CommuteRecord[]; excludedRecords: QualityIssue[]; counts: Record<DataQualityReason, number>; }

export const QUALITY_REASON_LABELS: Record<DataQualityReason, string> = {
  duplicate: '중복 기록',
  incomplete: '미완료 기록',
  invalid_duration: '비정상 이동시간',
  gps_jump: 'GPS 이상',
};

const MAX_REASONABLE_SPEED_KMH = 180;

function numberField(record: CommuteRecord, names: string[]) {
  const raw = record as unknown as Record<string, unknown>;
  for (const name of names) {
    const value = Number(raw[name]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function hasGpsJump(record: CommuteRecord) {
  const speed = numberField(record, ['max_speed_kmh', 'speed_kmh']);
  if (speed !== null && speed > MAX_REASONABLE_SPEED_KMH) return true;
  const km = numberField(record, ['distance_km']) ?? ((numberField(record, ['distance_meters', 'distance']) ?? 0) / 1000);
  return km > 0 && typeof record.duration_minutes === 'number' && record.duration_minutes > 0 && km / (record.duration_minutes / 60) > MAX_REASONABLE_SPEED_KMH;
}

function completedTripRequired(record: CommuteRecord) {
  return record.type === 'commute' || record.type === 'return';
}

export function assessDataQuality(records: CommuteRecord[]): QualityResult {
  const validRecords: CommuteRecord[] = [];
  const excludedRecords: QualityIssue[] = [];
  const counts: Record<DataQualityReason, number> = { duplicate: 0, incomplete: 0, invalid_duration: 0, gps_jump: 0 };

  for (const record of records) {
    const reasons: DataQualityReason[] = [];
    if (completedTripRequired(record) && (!record.start_time || !record.end_time)) reasons.push('incomplete');
    if (completedTripRequired(record) && (typeof record.duration_minutes !== 'number' || !Number.isFinite(record.duration_minutes) || record.duration_minutes < 0)) reasons.push('invalid_duration');
    if (hasGpsJump(record)) reasons.push('gps_jump');
    if (reasons.length) {
      reasons.forEach((reason) => counts[reason]++);
      excludedRecords.push({ record, reasons });
    } else validRecords.push(record);
  }

  return { validRecords, excludedRecords, counts };
}

export function qualitySummary(result: QualityResult) {
  return (Object.entries(result.counts) as [DataQualityReason, number][])
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${QUALITY_REASON_LABELS[reason]} ${count}건`);
}
