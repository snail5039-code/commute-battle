'use client';

import { useEffect, useState } from 'react';
import { generateStatsComment } from '@/lib/aiClient';
import { getStatsFallbackComment, MonthlyStats } from '@/lib/stats';

const ROTATE_MS = 5000;

function PetStatsMoodInner({ stats, monthLabel, className }: { stats: MonthlyStats; monthLabel: string; className: string }) {
  const [lines, setLines] = useState<string[]>(() => getStatsFallbackComment(stats));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let active = true;
    generateStatsComment(stats, monthLabel).then((result) => { if (active) setLines(result); });
    return () => { active = false; };
    // stats가 바뀌면 부모가 key를 바꿔 이 컴포넌트를 다시 마운트하므로, 여기서는 마운트당 한 번만 요청하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lines.length <= 1) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % lines.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [lines.length]);

  return (
    <div className={`rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950 ${className}`} aria-live="polite">
      <p className="mb-1 text-[11px] font-bold text-blue-500">🐾 펫의 한마디</p>
      <p key={index} className="pet-mood-line">{lines[index]}</p>
    </div>
  );
}

/** stats 신호(기간·건수·지각 관련 수치)가 바뀌면 key가 바뀌어 내부 상태를 새로 시작한다. */
export default function PetStatsMood({ stats, monthLabel, className = '' }: { stats: MonthlyStats; monthLabel: string; className?: string }) {
  const signature = `${monthLabel}:${stats.monthRecords.length}:${stats.evaluatedCommutes}:${stats.lateCount}:${stats.avgLateMinutes}:${stats.avgCommuteDuration}`;
  return <PetStatsMoodInner key={signature} stats={stats} monthLabel={monthLabel} className={className} />;
}
