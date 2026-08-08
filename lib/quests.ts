import type { CommuteRecord } from './types';

export type QuestPeriod = 'daily' | 'weekly';
export interface QuestDefinition { key: string; title: string; description: string; period: QuestPeriod; target: number; rewardExp: number; }
export interface QuestProgress extends QuestDefinition { current: number; completed: boolean; periodKey: string; claimKey: string; sourceRecordIds: string[]; }

export const QUESTS: QuestDefinition[] = [
  { key: 'daily_commute', title: '오늘 출근 완료', description: '오늘 출근을 한 번 완료하세요.', period: 'daily', target: 1, rewardExp: 5 },
  { key: 'daily_on_time', title: '정시 도착', description: '오늘 정시에 도착하세요.', period: 'daily', target: 1, rewardExp: 8 },
  { key: 'weekly_commutes', title: '주간 출근 루틴', description: '이번 주 출근을 5번 완료하세요.', period: 'weekly', target: 5, rewardExp: 20 },
  { key: 'weekly_round_trips', title: '주간 왕복 챌린지', description: '이번 주 출퇴근 왕복을 3일 완료하세요.', period: 'weekly', target: 3, rewardExp: 25 },
];

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function weekStart(now: Date) { const date = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return date; }
const completedTrip = (record: CommuteRecord) => (record.type === 'commute' || record.type === 'return') && Boolean(record.end_time);

export function getQuestProgress(records: CommuteRecord[], now = new Date()): QuestProgress[] {
  const today = dateKey(now);
  const monday = dateKey(weekStart(now));
  const daily = records.filter((record) => record.date === today);
  const weekly = records.filter((record) => record.date >= monday && record.date <= today);
  return QUESTS.map((quest) => {
    const pool = quest.period === 'daily' ? daily : weekly;
    let sources: CommuteRecord[];
    if (quest.key === 'daily_on_time') sources = pool.filter((record) => record.type === 'commute' && completedTrip(record) && record.is_on_time);
    else if (quest.key === 'weekly_round_trips') {
      const commutes = new Set(pool.filter((r) => r.type === 'commute' && completedTrip(r)).map((r) => r.date));
      const dates = new Set(pool.filter((r) => r.type === 'return' && completedTrip(r) && commutes.has(r.date)).map((r) => r.date));
      sources = [...dates].map((date) => pool.find((r) => r.date === date && r.type === 'return')!).filter(Boolean);
    } else sources = pool.filter((record) => record.type === 'commute' && completedTrip(record));
    const sourceRecordIds = [...new Set(sources.map((record) => record.id))].sort();
    const periodKey = quest.period === 'daily' ? today : monday;
    return { ...quest, current: Math.min(sourceRecordIds.length, quest.target), completed: sourceRecordIds.length >= quest.target, periodKey, claimKey: `${quest.key}:${periodKey}`, sourceRecordIds };
  });
}

export interface QuestClaimLedger { claimKeys: string[]; rewardedRecordIds: string[]; }
export interface QuestClaimResult { accepted: boolean; expAwarded: number; ledger: QuestClaimLedger; reason?: 'incomplete' | 'already-claimed' | 'records-already-rewarded'; delta?: { claimKey: string; rewardedRecordIds: string[] }; }
export function claimQuestReward(quest: QuestProgress, ledger: QuestClaimLedger): QuestClaimResult {
  const claims = new Set(ledger.claimKeys); const rewarded = new Set(ledger.rewardedRecordIds);
  if (!quest.completed) return { accepted: false, expAwarded: 0, ledger, reason: 'incomplete' };
  if (claims.has(quest.claimKey)) return { accepted: false, expAwarded: 0, ledger, reason: 'already-claimed' };
  // 퀘스트 키별로 네임스페이스를 둔다. 그렇지 않으면 같은 출근 기록이 daily_commute 보상에
  // 먼저 쓰였을 때 그 기록을 포함하는 weekly_commutes가 영원히 "이미 보상받음"으로 막혀버린다.
  const requiredIds = quest.sourceRecordIds.slice(0, quest.target).map((id) => `${quest.key}:${id}`);
  if (requiredIds.some((id) => rewarded.has(id))) return { accepted: false, expAwarded: 0, ledger, reason: 'records-already-rewarded' };
  claims.add(quest.claimKey); requiredIds.forEach((id) => rewarded.add(id));
  return { accepted: true, expAwarded: quest.rewardExp, ledger: { claimKeys: [...claims], rewardedRecordIds: [...rewarded] }, delta: { claimKey: quest.claimKey, rewardedRecordIds: requiredIds } };
}

export function mergeQuestLedgers(a: QuestClaimLedger, b: QuestClaimLedger): QuestClaimLedger {
  return { claimKeys: [...new Set([...a.claimKeys, ...b.claimKeys])], rewardedRecordIds: [...new Set([...a.rewardedRecordIds, ...b.rewardedRecordIds])] };
}

export const QUEST_LEDGER_KEY = 'commute-battle:quest-ledger';
export function readQuestLedger(): QuestClaimLedger { if (typeof window === 'undefined') return { claimKeys: [], rewardedRecordIds: [] }; try { const value = JSON.parse(localStorage.getItem(QUEST_LEDGER_KEY) ?? '{}'); return { claimKeys: Array.isArray(value.claimKeys) ? value.claimKeys : [], rewardedRecordIds: Array.isArray(value.rewardedRecordIds) ? value.rewardedRecordIds : [] }; } catch { return { claimKeys: [], rewardedRecordIds: [] }; } }
export function saveQuestLedger(ledger: QuestClaimLedger) { if (typeof window !== 'undefined') localStorage.setItem(QUEST_LEDGER_KEY, JSON.stringify(ledger)); }
