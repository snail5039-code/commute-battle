'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Share2 } from 'lucide-react';
import { CommuteRecord, User } from '@/lib/types';
import { computePeriodStats } from '@/lib/stats';
import { useStore } from '@/lib/store';
import { PET_CATALOG, useSelectedPetId } from '@/lib/petCatalog';
import { buildWeeklyRecapData } from '@/lib/weeklyRecapCard';
import PetStatsMood from './PetStatsMood';
import WeeklyRecapCard from './WeeklyRecapCard';

export default function StatsSummaryWidget({ user, records }: { user: User; records: CommuteRecord[] }) {
  const schedule = useStore((state) => state.workSchedule);
  const petId = useSelectedPetId();
  const [showRecap, setShowRecap] = useState(false);
  const stats = computePeriodStats(records, 'month', new Date(), schedule);
  const items = [
    ['완료 이동', stats.commuteArrivals.length + stats.returnArrivals.length, '건'],
    ['왕복', stats.roundTripDays, '일'],
    ['지각', stats.lateCount, '건'],
    ['지각률', stats.lateRate ?? '-', stats.lateRate === null ? '' : '%'],
  ];

  return <section className="card h-full p-5">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-bold">이번 달 통계</h3>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setShowRecap(true)} aria-label="주간 리캡 공유" title="주간 리캡 공유" className="flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-800"><Share2 size={13} />리캡</button>
        <Link href="/stats" className="flex items-center text-xs text-blue-700">자세히 <ChevronRight size={14} /></Link>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2">
      {items.map(([label, value, suffix]) => <div key={label} className="rounded-xl bg-slate-50 p-3">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 text-lg font-bold">{value}<span className="ml-0.5 text-xs">{suffix}</span></p>
      </div>)}
    </div>

    <PetStatsMood stats={stats} monthLabel={stats.range.label} className="mt-3" />

    {showRecap && (
      <WeeklyRecapCard
        data={buildWeeklyRecapData(computePeriodStats(records, 'week', new Date(), schedule), PET_CATALOG[petId], user.character_stage, user.character_level)}
        onClose={() => setShowRecap(false)}
      />
    )}
  </section>;
}
