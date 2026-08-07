'use client';

import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { recordArrival } from '@/lib/commuteArrival';
import CommuteMapView from '@/components/CommuteMapView';
import TopBar from '@/components/TopBar';
import { localDateKey } from '@/lib/date';

export default function MapPage() {
  const router = useRouter();
  const { user, records, refetch } = useAppData();

  if (!user) return null;

  const today = localDateKey(new Date());
  const activeRecord = records.find(
    (r) =>
      r.date === today &&
      (r.type === 'commute' || r.type === 'return') &&
      !r.end_time
  );

  if (!activeRecord) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopBar title="이동" subtitle="실시간 위치 추적" />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-2">
            <MapPin className="mx-auto text-neutral-300" size={32} />
            <p className="text-[13px] text-neutral-400">
              출근 또는 퇴근 중일 때만 실시간 위치를 볼 수 있어요
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CommuteMapView
      user={user}
      activeRecord={activeRecord}
      onArrive={async () => {
        await recordArrival(user, records, activeRecord);
        await refetch();
        router.push('/');
      }}
      onClose={() => router.push('/')}
    />
  );
}
