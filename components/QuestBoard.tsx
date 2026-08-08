'use client';

import { useEffect, useState } from 'react';
import { Check, Gift, ShieldCheck, X } from 'lucide-react';
import type { CommuteRecord } from '@/lib/types';
import { claimQuestReward, getQuestProgress, mergeQuestLedgers, readQuestLedger, saveQuestLedger, type QuestClaimLedger } from '@/lib/quests';
import { fetchQuestLedger, persistQuestClaim } from '@/lib/questLedger';

export default function QuestBoard({ userId, records, onReward }: { userId: string; records: CommuteRecord[]; onReward?: (exp: number) => Promise<boolean> }) {
  // localStorage 기록은 DB 조회가 끝나기 전까지 화면이 빈 상태로 깜빡이지 않게 하는 초기값일
  // 뿐이고, 실제로 "이미 받았는지"는 항상 DB(quest_claims)가 기준이다 — 그래야 시크릿창이나
  // 다른 기기에서 열어도 같은 퀘스트를 두 번 받을 수 없다.
  const [ledger, setLedger] = useState<QuestClaimLedger>(() => readQuestLedger());
  const [busy, setBusy] = useState<string | null>(null);
  const [completedQuest, setCompletedQuest] = useState<{ title: string; exp: number } | null>(null);
  const [notice, setNotice] = useState('');
  const quests = getQuestProgress(records);

  useEffect(() => {
    let active = true;
    fetchQuestLedger(userId).then((remote) => {
      if (!active) return;
      const merged = mergeQuestLedgers(readQuestLedger(), remote);
      saveQuestLedger(merged);
      setLedger(merged);
    });
    return () => { active = false; };
  }, [userId]);

  const claim = async (quest: (typeof quests)[number]) => {
    if (busy || ledger.claimKeys.includes(quest.claimKey)) return;
    setBusy(quest.claimKey);
    setNotice('');
    const result = claimQuestReward(quest, ledger);
    if (result.accepted) {
      const persisted = await persistQuestClaim(userId, result);
      if (persisted) {
        const saved = await onReward?.(result.expAwarded) ?? true;
        if (saved) {
          saveQuestLedger(result.ledger);
          setLedger(result.ledger);
          setCompletedQuest({ title: quest.title, exp: result.expAwarded });
        }
      } else {
        // insert가 실패했다면 대부분 (user_id, claim_key) 유니크 제약에 걸린 것 — 다른 기기/탭에서
        // 이미 받았다는 뜻이다. DB를 다시 읽어 화면을 맞추고, EXP는 다시 주지 않는다.
        const remote = await fetchQuestLedger(userId);
        const merged = mergeQuestLedgers(ledger, remote);
        saveQuestLedger(merged);
        setLedger(merged);
        setNotice('이미 다른 기기에서 받은 퀘스트예요.');
      }
    }
    setBusy(null);
  };

  return <>
    <section className="card p-5" aria-labelledby="quest-title">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="quest-title" className="font-bold text-slate-900">출근 퀘스트</h2><p className="mt-1 text-xs text-slate-500">실제 기록으로 매일·매주 자동 갱신돼요.</p></div><ShieldCheck className="text-emerald-500" size={22} /></div>
    {notice && <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{quests.map((quest) => {
      const claimed = ledger.claimKeys.includes(quest.claimKey); const percent = Math.min(100, quest.current / quest.target * 100);
      return <article key={quest.claimKey} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-2"><div><span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">{quest.period === 'daily' ? 'Daily' : 'Weekly'}</span><h3 className="mt-0.5 text-sm font-bold text-slate-800">{quest.title}</h3></div><span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">+{quest.rewardExp} EXP</span></div>
        <p className="mt-1 text-xs text-slate-500">{quest.description}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500 transition-[width] motion-reduce:transition-none" style={{ width: `${percent}%` }} /></div>
        <div className="mt-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{quest.current}/{quest.target}</span><button type="button" disabled={!quest.completed || claimed || busy !== null} onClick={() => claim(quest)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-500">{claimed ? <><Check size={14} />수령 완료</> : <><Gift size={14} />보상 받기</>}</button></div>
      </article>;
    })}</div>
    <p className="mt-3 text-[11px] text-slate-400">동일 기록 ID와 동일 기간 퀘스트는 한 번만 EXP 보상에 사용됩니다.</p>
    </section>

    {completedQuest && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="퀘스트 완료">
        <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-8 text-center shadow-2xl motion-safe:animate-[quest-celebrate-in_.4s_ease-out]">
          <button type="button" onClick={() => setCompletedQuest(null)} aria-label="닫기" className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-50 text-emerald-600 motion-safe:animate-[quest-celebrate-bounce_.8s_ease-in-out_infinite]"><Gift size={34} /></div>
          <p className="mt-5 text-sm font-bold text-emerald-600">퀘스트 완료되었습니다!</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">{completedQuest.title}</h2>
          <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">+{completedQuest.exp} EXP 획득!</p>
          <button type="button" onClick={() => setCompletedQuest(null)} className="mt-6 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white">확인</button>
          <style jsx>{`@keyframes quest-celebrate-in{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}@keyframes quest-celebrate-bounce{50%{transform:translateY(-6px)}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`}</style>
        </div>
      </div>
    )}
  </>;
}
