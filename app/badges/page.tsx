'use client';

import { useMemo, useState } from 'react';
import { Check, Lightbulb, LockKeyhole, Sparkles } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { type BadgeRarity, getBadgeSummary } from '@/lib/badges';
import { type LevelProgress } from '@/lib/characterStages';
import { awardExpSafely } from '@/lib/expReward';
import { isAccessoryUnlocked, PET_ACCESSORIES, storeAccessoryId, useEquippedAccessoryId } from '@/lib/petCatalog';
import { readQuestLedger } from '@/lib/quests';
import TopBar from '@/components/TopBar';
import BadgeIcon from '@/components/BadgeIcon';
import QuestBoard from '@/components/QuestBoard';
import EvolutionCelebration from '@/components/EvolutionCelebration';

const RARITY: Record<BadgeRarity, { label: string; chip: string; icon: string; bar: string }> = {
  common: { label: '일반', chip: 'bg-slate-100 text-slate-600', icon: 'bg-slate-100 text-slate-500 ring-slate-200', bar: 'bg-slate-500' },
  rare: { label: '희귀', chip: 'bg-blue-50 text-blue-700', icon: 'bg-blue-50 text-blue-600 ring-blue-100', bar: 'bg-blue-500' },
  epic: { label: '영웅', chip: 'bg-violet-50 text-violet-700', icon: 'bg-violet-50 text-violet-600 ring-violet-100', bar: 'bg-violet-500' },
  legendary: { label: '전설', chip: 'bg-amber-50 text-amber-700', icon: 'bg-amber-50 text-amber-600 ring-amber-100', bar: 'bg-amber-500' },
};

export default function BadgesPage() {
  const { user, records, loading, refetch } = useAppData();
  const [celebration, setCelebration] = useState<LevelProgress | null>(null);
  const summary = useMemo(() => getBadgeSummary(records), [records]);
  const equippedAccessoryId = useEquippedAccessoryId();
  if (loading) return null;
  if (!user) return <div className="flex min-h-screen flex-col"><TopBar title="배지" /><div className="p-8 text-sm text-slate-500">게임을 먼저 시작해 주세요.</div></div>;
  const { progress, completed, total } = summary;
  const completedBadges = new Set(progress.filter((x) => x.completed).map((x) => x.badge.key));
  const completedQuests = new Set(readQuestLedger().claimKeys.map((key) => key.split(':')[0]));
  const reward = async (exp: number) => {
    const next = await awardExpSafely(user, exp);
    if (!next) return false;
    await refetch();
    if (next.levelsGained > 0) setCelebration(next);
    return true;
  };
  const toggleEquip = (accessoryId: string, unlocked: boolean) => {
    if (!unlocked) return;
    storeAccessoryId(equippedAccessoryId === accessoryId ? null : accessoryId);
  };

  return <div className="flex min-h-screen flex-col"><TopBar title="배지와 퀘스트" subtitle={`나의 배지 ${completed} / ${total}`} />
    <main className="flex-1 p-4 md:p-8"><div className="mx-auto max-w-5xl space-y-6">
      <section className="card overflow-hidden p-6 text-slate-900"><div className="flex min-w-0 flex-col justify-between gap-5 sm:flex-row sm:items-end"><div className="min-w-0"><div className="mb-2 flex items-center gap-2 text-blue-600"><Sparkles size={16} /><span className="text-xs font-bold tracking-widest">나의 배지 모음</span></div><h1 className="break-keep text-2xl font-black text-slate-950">출퇴근 모험 도감</h1><p className="mt-2 max-w-lg break-words text-sm leading-relaxed text-slate-600">실제 출퇴근 기록으로 배지와 펫 액세서리를 해금하세요. 휴가·병가는 연속 출근을 보호하고 결근은 기록을 끊습니다.</p></div><div className="shrink-0 text-right"><strong className="text-3xl text-slate-950">{completed}</strong><span className="text-slate-500"> / {total}</span></div></div></section>
      <QuestBoard userId={user.id} records={records} onReward={reward} />
      <section className="card p-5"><h2 className="font-bold text-slate-900">펫 액세서리</h2><p className="mt-1 text-xs text-slate-500">레벨, 배지, 퀘스트를 달성해 액세서리를 모으고, 눌러서 펫에게 착용시켜 보세요.</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{PET_ACCESSORIES.map((item) => { const unlocked = isAccessoryUnlocked(item, user.character_level, completedBadges, completedQuests); const equipped = equippedAccessoryId === item.id; return <button type="button" key={item.id} disabled={!unlocked} aria-pressed={equipped} onClick={() => toggleEquip(item.id, unlocked)} className={`rounded-2xl border p-3 text-left transition-colors ${equipped ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300' : unlocked ? 'border-amber-200 bg-amber-50 hover:border-amber-300' : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'}`}><div className="text-xl" aria-hidden>{unlocked ? item.emoji : '○'}</div><h3 className="mt-2 text-xs font-bold">{item.name}</h3><p className="mt-1 text-[10px] leading-relaxed">{unlocked ? item.description : '조건을 달성하면 해금'}</p>{unlocked && <p className={`mt-1.5 text-[10px] font-bold ${equipped ? 'text-blue-700' : 'text-amber-700'}`}>{equipped ? '착용 중 · 눌러서 해제' : '눌러서 착용'}</p>}</button>; })}</div></section>
      <section className="min-w-0"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-slate-900">전체 배지</h2><span className="text-xs text-slate-500">{Math.round(completed / total * 100)}% 완료</span></div><div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">{progress.map(({ badge, displayed, percent, completed: done, revealed }) => { const style = RARITY[badge.rarity]; return <article key={badge.key} className={`card min-w-0 p-5 ${done ? '' : 'opacity-90'}`}><div className="flex min-w-0 items-start gap-3"><div className={`grid size-12 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ${revealed ? style.icon : 'bg-slate-100 text-slate-400 ring-slate-200'}`}>{revealed ? <BadgeIcon icon={badge.icon} /> : <LockKeyhole size={18} />}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="break-words text-sm font-bold text-slate-800">{revealed ? badge.name : '비밀 배지'}</h3>{done && <Check size={16} className="shrink-0 text-emerald-500" />}</div><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${style.chip}`}>{style.label}</span></div></div><p className="mt-3 min-h-8 break-words text-xs leading-relaxed text-slate-500">{revealed ? badge.description : badge.hint}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${style.bar}`} style={{ width: `${percent}%` }} /></div><div className="mt-2 flex min-w-0 items-start justify-between gap-2 text-[11px] text-slate-400"><span className="shrink-0">{displayed}/{badge.target}{badge.unit}</span>{!done && <span className="flex min-w-0 items-start gap-1 break-words text-right"><Lightbulb size={11} className="mt-0.5 shrink-0" />{badge.hint}</span>}</div></article>; })}</div></section>
    </div></main>{celebration && <EvolutionCelebration level={celebration.level} stage={celebration.stage} evolved={celebration.evolved} onClose={() => setCelebration(null)} />}</div>;
}
