'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { computeMonthlyStats } from '@/lib/stats';
import { generateStatsComment } from '@/lib/gemini';
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
  const [comment, setComment] = useState<string | null>(null);
  const [commentLoading, setCommentLoading] = useState(false);

  const now = new Date();
  const stats = computeMonthlyStats(records, now);
  const monthLabel = `${now.getMonth() + 1}월`;

  useEffect(() => {
    if (!user || records.length === 0) return;

    let cancelled = false;
    setCommentLoading(true);

    generateStatsComment(stats, monthLabel).then((text) => {
      if (!cancelled) {
        setComment(text);
        setCommentLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, records.length, monthLabel]);

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

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="통계" subtitle={`${monthLabel} 생존 보고서`} />

      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="card p-5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
              <Sparkles size={15} />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-blue-500 mb-1">
                AI 코멘트
              </p>
              <p className="text-[13px] text-neutral-700 leading-relaxed">
                {commentLoading || !comment
                  ? '데이터를 분석하는 중...'
                  : comment}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
    </div>
  );
}
