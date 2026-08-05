'use client';

import { useAppData } from '@/lib/useAppData';
import CommuteButton from './CommuteButton';
import CharacterCard from './CharacterCard';
import CalendarView from './CalendarView';
import BadgesWidget from './BadgesWidget';
import StatsSummaryWidget from './StatsSummaryWidget';
import TopBar from './TopBar';

export default function DashBoard() {
  const { user, records, refetch } = useAppData();

  if (!user) return null;

  return (
    <div className="flex min-h-screen min-w-0 flex-col">
      <TopBar title="홈" subtitle="오늘도 무사 귀환!" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-8 md:py-8">
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <CommuteButton user={user} records={records} onChange={refetch} />
          <CharacterCard user={user} />
          <StatsSummaryWidget records={records} />

          <div className="sm:col-span-2">
            <CalendarView records={records} />
          </div>
          <BadgesWidget records={records} user={user} />
        </div>
      </main>
    </div>
  );
}
