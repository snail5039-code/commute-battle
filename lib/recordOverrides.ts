'use client';

export const RECORD_OVERRIDES_EVENT = 'commuteBattle:recordOverrides';
const PREFIX = 'commuteBattle.statsExcludedRecordIds';
export function recordOverridesKey(userId?: string) { return `${PREFIX}:${userId || 'local'}`; }
export function loadExcludedRecordIds(userId?: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try { const value = JSON.parse(localStorage.getItem(recordOverridesKey(userId)) || '[]'); return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []); } catch { return new Set(); }
}
export function setRecordExcluded(userId: string | undefined, recordId: string, excluded: boolean) {
  const ids = loadExcludedRecordIds(userId);
  if (excluded) ids.add(recordId); else ids.delete(recordId);
  localStorage.setItem(recordOverridesKey(userId), JSON.stringify([...ids]));
  window.dispatchEvent(new CustomEvent(RECORD_OVERRIDES_EVENT, { detail: { userId } }));
  return ids;
}
