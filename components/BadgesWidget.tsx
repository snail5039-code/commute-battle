'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { BADGES } from '@/lib/badges';
import { CommuteRecord } from '@/lib/types';
import BadgeIcon from './BadgeIcon';

export default function BadgesWidget({
  records,
}: {
  records: CommuteRecord[];
}) {
  const withProgress = BADGES.map((badge) => {
    const progress = Math.min(badge.progress(records), badge.target);
    return { badge, progress, isCompleted: progress >= badge.target };
  });

  const completedCount = withProgress.filter((b) => b.isCompleted).length;
  const upNext = withProgress
    .filter((b) => !b.isCompleted)
    .sort((a, b) => b.progress / b.badge.target - a.progress / a.badge.target)
    .slice(0, 3);

  return (
    <div className="card p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-semibold text-neutral-900">배지</h3>
        <Link
          href="/badges"
          className="flex items-center gap-0.5 text-[12px] text-neutral-400 hover:text-blue-600 transition-colors"
        >
          {completedCount} / {BADGES.length}
          <ChevronRight size={14} />
        </Link>
      </div>

      <div className="space-y-3 flex-1">
        {upNext.length === 0 ? (
          <p className="text-[12px] text-neutral-400">모든 배지를 획득했습니다</p>
        ) : (
          upNext.map(({ badge, progress }) => (
            <div key={badge.key} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center shrink-0">
                <BadgeIcon icon={badge.icon} size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-neutral-700 truncate">
                  {badge.name}
                </p>
                <div className="w-full bg-neutral-100 rounded-full h-1 mt-1">
                  <div
                    className="bg-blue-400 h-1 rounded-full"
                    style={{ width: `${(progress / badge.target) * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-[11px] text-neutral-400 shrink-0">
                {progress}/{badge.target}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
