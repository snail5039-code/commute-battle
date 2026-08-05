'use client';

import { useAppData } from '@/lib/useAppData';
import { BADGES } from '@/lib/badges';
import TopBar from '@/components/TopBar';
import BadgeIcon from '@/components/BadgeIcon';

export default function BadgesPage() {
  const { user, records, loading } = useAppData();

  if (loading) return null;
  if (!user) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopBar title="배지" />
        <div className="p-8 text-sm text-neutral-500">
          홈에서 먼저 시작해주세요.
        </div>
      </div>
    );
  }

  const completedCount = BADGES.filter(
    (b) => b.progress(records) >= b.target
  ).length;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        title="배지"
        subtitle={`나의 생존 배지 ${completedCount} / ${BADGES.length}`}
      />

      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          {BADGES.map((badge) => {
            const progress = Math.min(badge.progress(records), badge.target);
            const isCompleted = progress >= badge.target;
            const percent = (progress / badge.target) * 100;

            return (
              <div
                key={badge.key}
                className={`card p-5 flex items-start gap-4 ${
                  !isCompleted && 'opacity-90'
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                    isCompleted
                      ? 'bg-blue-50 ring-1 ring-blue-100 text-blue-500'
                      : 'bg-neutral-100 text-neutral-400'
                  }`}
                >
                  <BadgeIcon icon={badge.icon} size={19} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3
                      className={`text-[13px] font-semibold ${
                        isCompleted ? 'text-neutral-900' : 'text-neutral-500'
                      }`}
                    >
                      {badge.name}
                    </h3>
                    {isCompleted && (
                      <span className="text-[11px] font-semibold text-blue-600">
                        완료
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-neutral-500 mt-0.5">
                    {badge.description}
                  </p>

                  {!isCompleted && (
                    <div className="mt-2.5">
                      <div className="w-full bg-neutral-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-400 h-1.5 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        {progress} / {badge.target}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
