'use client';

import Link from 'next/link';
import { ChevronRight, LockKeyhole } from 'lucide-react';
import { getBadgeSummary } from '@/lib/badges';
import { CommuteRecord } from '@/lib/types';
import BadgeIcon from './BadgeIcon';

export default function BadgesWidget({ records }: { records: CommuteRecord[] }) {
  const { progress, completed, total } = getBadgeSummary(records);
  const upNext = progress.filter((item) => !item.completed).sort((a, b) => b.percent - a.percent || a.badge.target - b.badge.target).slice(0, 3);
  return <section className="card h-full overflow-hidden" aria-labelledby="badge-widget-title">
    <div className="p-5"><div className="mb-4 flex items-center justify-between"><div><h3 id="badge-widget-title" className="text-[13px] font-bold text-slate-900">배지 도전</h3><p className="mt-0.5 text-[11px] text-slate-400">다음 해금까지 조금만 더!</p></div><Link href="/badges" className="flex items-center text-xs font-semibold text-blue-600" aria-label={`배지 ${completed}/${total}, 전체 보기`}>{completed} / {total}<ChevronRight size={14} /></Link></div>
      <div className="space-y-3">{upNext.length === 0 ? <p className="rounded-xl bg-amber-50 px-3 py-4 text-center text-xs font-medium text-amber-700">모든 배지를 해금했어요!</p> : upNext.map(({ badge, displayed, percent, revealed }) => <div key={badge.key} className="flex items-center gap-3"><div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${revealed ? 'bg-indigo-50 text-indigo-600 ring-indigo-100' : 'bg-slate-100 text-slate-400 ring-slate-200'}`}>{revealed ? <BadgeIcon icon={badge.icon} size={16} /> : <LockKeyhole size={15} />}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate text-xs font-semibold text-slate-700">{revealed ? badge.name : '비밀 배지'}</p><span className="text-[10px] text-slate-400">{displayed}/{badge.target}{badge.unit}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500" style={{ width: `${percent}%` }} /></div></div></div>)}</div>
    </div>
  </section>;
}
