'use client';

import { Check, Lightbulb, LockKeyhole, Sparkles } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { BadgeRarity, getBadgeSummary } from '@/lib/badges';
import TopBar from '@/components/TopBar';
import BadgeIcon from '@/components/BadgeIcon';

const RARITY: Record<BadgeRarity, { label: string; chip: string; icon: string; bar: string }> = {
  common: { label: '일반', chip: 'bg-slate-100 text-slate-600', icon: 'bg-slate-100 text-slate-500 ring-slate-200', bar: 'bg-slate-500' },
  rare: { label: '희귀', chip: 'bg-blue-50 text-blue-700', icon: 'bg-blue-50 text-blue-600 ring-blue-100', bar: 'bg-blue-500' },
  epic: { label: '영웅', chip: 'bg-violet-50 text-violet-700', icon: 'bg-violet-50 text-violet-600 ring-violet-100', bar: 'bg-violet-500' },
  legendary: { label: '전설', chip: 'bg-amber-50 text-amber-700', icon: 'bg-amber-50 text-amber-600 ring-amber-100', bar: 'bg-amber-500' },
};

export default function BadgesPage() {
  const { user, records, loading } = useAppData();
  if (loading) return null;
  if (!user) return <div className="flex min-h-screen flex-col"><TopBar title="배지" /><div className="p-8 text-sm text-slate-500">게임을 먼저 시작해 주세요.</div></div>;

  const { progress, completed, total } = getBadgeSummary(records);
  const overallPercent = Math.round((completed / total) * 100);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title="배지" subtitle={`나의 생존 배지 ${completed} / ${total}`} />
      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <section className="card mb-6 overflow-hidden bg-gradient-to-br from-slate-900 to-blue-950 p-6 text-white">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2 text-blue-200"><Sparkles size={16} /><span className="text-xs font-bold uppercase tracking-widest">Badge collection</span></div>
                <h1 className="text-2xl font-black tracking-tight">출퇴근 모험 도감</h1>
                <p className="mt-1.5 text-sm text-slate-300">평범한 하루도 기록하면 업적이 됩니다.</p>
              </div>
              <div className="min-w-48">
                <div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-300">수집 진행도</span><strong>{overallPercent}%</strong></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 transition-[width]" style={{ width: `${overallPercent}%` }} /></div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {progress.map(({ badge, displayed, percent, completed: done, revealed }) => {
              const rarity = RARITY[badge.rarity];
              return (
                <article key={badge.key} className={`card relative overflow-hidden p-5 transition-transform hover:-translate-y-0.5 ${done ? 'ring-1 ring-blue-100' : ''}`}>
                  {done && <div className="absolute right-0 top-0 rounded-bl-2xl bg-emerald-500 px-3 py-2 text-white" aria-label="완료"><Check size={14} strokeWidth={3} /></div>}
                  <div className="flex items-start gap-3.5">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${done ? rarity.icon : 'bg-slate-100 text-slate-400 ring-slate-200'}`}>
                      {revealed ? <BadgeIcon icon={badge.icon} size={21} /> : <LockKeyhole size={19} />}
                    </div>
                    <div className="min-w-0 flex-1 pr-5">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${rarity.chip}`}>{rarity.label}</span>
                        {badge.hidden && <span className="text-[10px] font-semibold text-slate-400">HIDDEN</span>}
                      </div>
                      <h2 className={`text-sm font-bold ${revealed ? 'text-slate-900' : 'text-slate-500'}`}>{revealed ? badge.name : '??? 비밀 배지'}</h2>
                    </div>
                  </div>

                  <p className="mt-4 min-h-10 text-xs leading-relaxed text-slate-500">{revealed ? badge.description : '달성하면 배지의 이름과 조건이 공개됩니다.'}</p>
                  {!done && <div className="mt-3 flex gap-2 rounded-xl bg-amber-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800"><Lightbulb className="mt-0.5 shrink-0" size={13} /><span><strong>힌트</strong> · {badge.hint}</span></div>}
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-[11px]"><span className="font-medium text-slate-500">{done ? '해금 완료' : '진행 중'}</span><span className="font-semibold text-slate-600">{displayed} / {badge.target}{badge.unit} · {percent}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-[width] ${done ? 'bg-emerald-500' : rarity.bar}`} style={{ width: `${percent}%` }} /></div>
                  </div>
                  {done && <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600"><Sparkles size={13} />새로운 업적이 해금되었어요!</div>}
                </article>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
