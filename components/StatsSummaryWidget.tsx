'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { CommuteRecord } from '@/lib/types';
import { computeMonthlyStats } from '@/lib/stats';

export default function StatsSummaryWidget({ records }: { records: CommuteRecord[] }) {
  const now = new Date();
  const stats = computeMonthlyStats(records, now);
  const items = [
    { label: '완료한 이동', value: stats.commuteArrivals.length + stats.returnArrivals.length, suffix: '건' },
    { label: '왕복 기록', value: stats.roundTripDays, suffix: '일' },
    { label: '지각 횟수', value: stats.lateCount, suffix: '회' },
    { label: '지각률', value: stats.lateRate ?? '-', suffix: stats.lateRate === null ? '' : '%' },
  ];
  const hasIncompleteData = stats.incompleteCommutes + stats.invalidArrivalTimes > 0;

  return (
    <div className="card flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-neutral-900">{now.getMonth() + 1}월 통계</h3>
        <Link href="/stats" className="flex items-center gap-0.5 text-[12px] text-neutral-400 transition-colors hover:text-blue-600">
          자세히<ChevronRight size={14} />
        </Link>
      </div>
      {stats.monthRecords.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-[10px] bg-neutral-50 p-4 text-center text-[12px] leading-relaxed text-neutral-400">
          이번 달 첫 기록을 남기면<br />통계가 채워져요.
        </div>
      ) : (
        <>
          <div className="grid flex-1 grid-cols-2 gap-3">
            {items.map((item) => (
              <div key={item.label} className="rounded-[10px] bg-neutral-50 p-3">
                <p className="text-[11px] text-neutral-500">{item.label}</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-neutral-900">{item.value}{item.suffix}</p>
              </div>
            ))}
          </div>
          {hasIncompleteData && (
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-amber-700">
              <AlertTriangle size={12} />불완전한 출근 기록은 지각 통계에서 제외
            </p>
          )}
        </>
      )}
    </div>
  );
}
