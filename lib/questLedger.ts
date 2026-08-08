import { supabase } from './supabase';
import type { QuestClaimLedger, QuestClaimResult } from './quests';

// 서버(quest_claims 테이블)가 진짜 클레임 여부를 판단하는 곳이다. (user_id, claim_key)
// 유니크 제약이 있어서, 이미 받은 퀘스트를 다른 기기/시크릿창에서 다시 클레임하려는
// insert는 그냥 실패한다 — 그게 곧 원자적인 "이미 받았음" 체크다.
export async function fetchQuestLedger(userId: string): Promise<QuestClaimLedger> {
  const { data, error } = await supabase.from('quest_claims').select('claim_key, rewarded_record_ids').eq('user_id', userId);
  if (error || !data) return { claimKeys: [], rewardedRecordIds: [] };
  return {
    claimKeys: data.map((row) => row.claim_key as string),
    rewardedRecordIds: data.flatMap((row) => (row.rewarded_record_ids as string[] | null) ?? []),
  };
}

export async function persistQuestClaim(userId: string, result: QuestClaimResult): Promise<boolean> {
  if (!result.accepted || !result.delta) return false;
  const { error } = await supabase.from('quest_claims').insert({
    user_id: userId,
    claim_key: result.delta.claimKey,
    rewarded_record_ids: result.delta.rewardedRecordIds,
  });
  return !error;
}
