'use client';

import Link from 'next/link';
import { ChevronRight, LockKeyhole } from 'lucide-react';
import { getBadgeSummary } from '@/lib/badges';
import { CommuteRecord, User } from '@/lib/types';
import BadgeIcon from './BadgeIcon';
import CharacterIcon from './CharacterIcon';

const STAGE_NAMES: Record<User['character_stage'], string> = {
  alg: '알', seedling: '새싹', warrior: '전사', veteran: '베테랑',
};

export default function BadgesWidget({ records, user }: { records: CommuteRecord[]; user?: User }) {
  const { progress, completed, total } = getBadgeSummary(records);
  const upNext = progress
    .filter((item) => !item.completed)
    .sort((a, b) => b.percent - a.percent || a.badge.target - b.badge.target)
    .slice(0, 3);
  const expNeeded = user ? user.character_level * 20 : 0;
  const expPercent = user && expNeeded ? Math.min((user.character_exp / expNeeded) * 100, 100) : 0;

  return (
    <section className="card h-full overflow-hidden" aria-labelledby="badge-widget-title">
      {user && (
        <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-blue-100">
              <CharacterIcon stage={user.character_stage} size={21} strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold text-slate-800">{STAGE_NAMES[user.character_stage]} · Lv.{user.character_level}</p>
                <span className="shrink-0 text-[10px] font-semibold text-blue-700">배지 {completed}개 완료</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${expPercent}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">EXP {user.character_exp} / {expNeeded}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-full flex-col p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 id="badge-widget-title" className="text-[13px] font-bold text-slate-900">배지 도전</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">다음 해금까지 조금만 더!</p>
          </div>
          <Link href="/badges" className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700" aria-label={`배지 ${completed}/${total}, 전체 보기`}>
            {completed} / {total}<ChevronRight size={14} />
          </Link>
        </div>

        <div className="flex-1 space-y-3">
          {upNext.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-4 text-center text-xs font-medium text-amber-700">모든 배지를 해금했어요. 대단해요!</p>
          ) : upNext.map(({ badge, displayed, percent, revealed }) => (
            <div key={badge.key} className="flex items-center gap-3">
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${revealed ? 'bg-indigo-50 text-indigo-600 ring-indigo-100' : 'bg-slate-100 text-slate-400 ring-slate-200'}`}>
                {revealed ? <BadgeIcon icon={badge.icon} size={16} /> : <LockKeyhole size={15} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-slate-700">{revealed ? badge.name : '??? 비밀 배지'}</p>
                  <span className="shrink-0 text-[10px] text-slate-400">{displayed}/{badge.target}{badge.unit}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-[width]" style={{ width: `${percent}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
