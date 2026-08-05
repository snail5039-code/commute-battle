'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { CommuteRecord } from '@/lib/types';
import { computeMonthlyStats } from '@/lib/stats';
import { qualitySummary } from '@/lib/dataQuality';

export default function StatsSummaryWidget({ records }: { records: CommuteRecord[] }) {
  const stats = computeMonthlyStats(records, new Date());
  const issues = qualitySummary(stats.quality);
  const items = [['완료 이동', stats.commuteArrivals.length + stats.returnArrivals.length, '건'], ['왕복', stats.roundTripDays, '일'], ['지각', stats.lateCount, '건'], ['지각률', stats.lateRate ?? '-', stats.lateRate === null ? '' : '%']];
  return <div className="card flex h-full flex-col p-6"><div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">이번 달 통계</h3><Link href="/stats" className="flex items-center text-xs text-neutral-500">자세히<ChevronRight size={14}/></Link></div>
    <div className="grid flex-1 grid-cols-2 gap-3">{items.map(([label, value, suffix]) => <div key={label} className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}{suffix}</p></div>)}</div>
    {issues.length > 0 && <p className="mt-3 flex items-start gap-1 text-[10px] text-amber-700"><AlertTriangle size={12} className="shrink-0"/>품질 제외: {issues.join(', ')}</p>}
  </div>;
}
