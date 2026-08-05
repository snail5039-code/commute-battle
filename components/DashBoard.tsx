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
    <div className="flex flex-col min-h-screen">
      <TopBar title="홈" subtitle="오늘도 무사 귀환!" />

      <div className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <CommuteButton user={user} records={records} onChange={refetch} />
          <CharacterCard user={user} />
          <StatsSummaryWidget records={records} />

          <div className="sm:col-span-2">
            <CalendarView records={records} />
          </div>
          <BadgesWidget records={records} user={user} />
        </div>
      </div>
    </div>
  );
}
