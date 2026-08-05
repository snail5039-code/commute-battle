'use client';

import { useAppData } from '@/lib/useAppData';
import { computeMonthlyStats } from '@/lib/stats';
import TopBar from '@/components/TopBar';

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <p className="text-[12px] text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold text-neutral-900 mt-1 tracking-tight">
        {value}
      </p>
      {sub && <p className="text-[11px] text-neutral-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
  const { user, records, loading } = useAppData();

  if (loading) return null;
  if (!user) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopBar title="통계" />
        <div className="p-8 text-sm text-neutral-500">
          홈에서 먼저 시작해주세요.
        </div>
      </div>
    );
  }

  const now = new Date();
  const stats = computeMonthlyStats(records, now);

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="통계" subtitle={`${now.getMonth() + 1}월 생존 보고서`} />

      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatTile
            label="출근 완료"
            value={`${stats.commuteArrivals.length}회`}
          />
          <StatTile
            label="퇴근 완료"
            value={`${stats.returnArrivals.length}회`}
          />
          <StatTile
            label="정시 출근"
            value={`${stats.onTimeCommutes.length}회`}
            sub={`지각 ${stats.lateCommutes}회`}
          />
          <StatTile label="조퇴" value={`${stats.earlyLeaves.length}회`} />
          <StatTile label="휴가 · 병가" value={`${stats.vacations.length}일`} />
          <StatTile label="결근" value={`${stats.absences.length}회`} />
          <StatTile
            label="평균 출근 시간"
            value={stats.avgCommuteDuration ? `${stats.avgCommuteDuration}분` : '-'}
          />
          <StatTile
            label="평균 퇴근 시간"
            value={stats.avgReturnDuration ? `${stats.avgReturnDuration}분` : '-'}
          />
          <StatTile label="이번 달 생존율" value={`${stats.survivalRate}%`} />
        </div>
      </div>
    </div>
  );
}
