'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { CommuteRecord } from '@/lib/types';
import { computeMonthlyStats } from '@/lib/stats';

export default function StatsSummaryWidget({ records }: { records: CommuteRecord[] }) {
  const now = new Date();
  const stats = computeMonthlyStats(records, now);
  const items = [
    { label: '완료한 이동', value: stats.commuteArrivals.length + stats.returnArrivals.length, suffix: '회' },
    { label: '왕복 기록', value: stats.roundTripDays, suffix: '일' },
    { label: '기록한 날', value: stats.activeDays, suffix: '일' },
    { label: '평균 출근', value: stats.avgCommuteDuration ?? '—', suffix: stats.avgCommuteDuration === null ? '' : '분' },
  ];

  return (
    <div className="card p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-semibold text-neutral-900">{now.getMonth() + 1}월 통계</h3>
        <Link href="/stats" className="flex items-center gap-0.5 text-[12px] text-neutral-400 hover:text-blue-600 transition-colors">자세히 <ChevronRight size={14} /></Link>
      </div>
      {stats.monthRecords.length === 0 ? (
        <div className="flex-1 flex items-center justify-center rounded-[10px] bg-neutral-50 p-4 text-center text-[12px] leading-relaxed text-neutral-400">이번 달 첫 기록을 남기면<br />통계가 채워져요.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 flex-1">
          {items.map((item) => <div key={item.label} className="bg-neutral-50 rounded-[10px] p-3"><p className="text-[11px] text-neutral-500">{item.label}</p><p className="text-lg font-semibold text-neutral-900 mt-0.5 tracking-tight">{item.value}{item.suffix}</p></div>)}
        </div>
      )}
    </div>
  );
}
