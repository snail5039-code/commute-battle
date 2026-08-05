'use client';

import Link from 'next/link';
import { AlertTriangle, BriefcaseBusiness, ChevronRight, Clock3, Repeat2, TimerOff } from 'lucide-react';
import { CommuteRecord } from '@/lib/types';
import { computeMonthlyStats } from '@/lib/stats';
import { qualitySummary } from '@/lib/dataQuality';
import StatusIcon from './StatusIcon';
import { useStore, workTimeToMinutes } from '@/lib/store';

export default function StatsSummaryWidget({ records }: { records: CommuteRecord[] }) {
  const workStartTime = useStore((state) => state.workSchedule.startTime);
  const stats = computeMonthlyStats(records, new Date(), workTimeToMinutes(workStartTime));
  const issues = qualitySummary(stats.quality);
  const items = [
    { label: '완료 이동', value: stats.commuteArrivals.length + stats.returnArrivals.length, suffix: '건', icon: BriefcaseBusiness, tone: 'sky' as const },
    { label: '왕복', value: stats.roundTripDays, suffix: '일', icon: Repeat2, tone: 'indigo' as const },
    { label: '지각', value: stats.lateCount, suffix: '건', icon: Clock3, tone: 'amber' as const },
    { label: '지각률', value: stats.lateRate ?? '-', suffix: stats.lateRate === null ? '' : '%', icon: TimerOff, tone: 'slate' as const },
  ];
  return <section className="card flex h-full min-w-0 flex-col p-5 md:p-6"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-900">이번 달 통계</h3><Link href="/stats" className="flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-blue-700">자세히<ChevronRight size={14}/></Link></div>
    <div className="grid flex-1 grid-cols-2 gap-2.5">{items.map(({ label, value, suffix, icon, tone }) => <div key={label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 p-3"><StatusIcon icon={icon} tone={tone} size="sm" /><p className="mt-2 truncate text-[11px] font-medium text-slate-500">{label}</p><p className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">{value}<span className="ml-0.5 text-xs font-semibold text-slate-500">{suffix}</span></p></div>)}</div>
    {issues.length > 0 && <p className="mt-3 flex items-start gap-1 text-[10px] text-amber-700"><AlertTriangle size={12} className="shrink-0"/>품질 제외: {issues.join(', ')}</p>}
  </section>;
}
