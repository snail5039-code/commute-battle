'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { CommuteRecord } from '@/lib/types';
import { computePeriodStats } from '@/lib/stats';
import { useStore } from '@/lib/store';
export default function StatsSummaryWidget({records}:{records:CommuteRecord[]}){const schedule=useStore(s=>s.workSchedule);const stats=computePeriodStats(records,'month',new Date(),schedule);return <section className="card self-start p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">이번 달 통계</h3><Link href="/stats" className="flex items-center text-xs text-blue-700">자세히 <ChevronRight size={14}/></Link></div><div className="mt-4 grid grid-cols-2 gap-2">{[['완료 이동',stats.commuteArrivals.length+stats.returnArrivals.length,'건'],['왕복',stats.roundTripDays,'일'],['지각',stats.lateCount,'건'],['지각률',stats.lateRate??'-',stats.lateRate===null?'':'%']].map(([label,value,suffix])=><div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}<span className="ml-0.5 text-xs">{suffix}</span></p></div>)}</div></section>}
