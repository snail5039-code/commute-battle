'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, Palmtree, Check, MapPin, TrainFront, House, PartyPopper, LoaderCircle } from 'lucide-react';
import { User, CommuteRecord, RouteGuideResponse } from '@/lib/types';
import { generateRouteGuide } from '@/lib/gemini';
import { recordArrival } from '@/lib/commuteArrival';
import { supabase } from '@/lib/supabase';
import RouteModal from './RouteModal';

interface CommuteButtonProps {
  user: User;
  records: CommuteRecord[];
  onChange: () => void;
}

const WORK_START_MIN = 9 * 60;
const WORK_END_MIN = 18 * 60;

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatClock(date: Date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function CommuteButton({
  user,
  records,
  onChange,
}: CommuteButtonProps) {
  const router = useRouter();
  const [showRoute, setShowRoute] = useState(false);
  const [routeType, setRouteType] = useState<'commute' | 'return'>('commute');
  const [routeGuide, setRouteGuide] = useState<RouteGuideResponse | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const today = new Date().toISOString().split('T')[0];
  const activeRecord = records.find(
    (r) =>
      r.date === today &&
      (r.type === 'commute' || r.type === 'return') &&
      !r.end_time
  );
  const commuteCount = records.filter(
    (r) => r.date === today && r.type === 'commute'
  ).length;
  const returnCount = records.filter(
    (r) => r.date === today && r.type === 'return'
  ).length;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const requestRoute = async (type: 'commute' | 'return') => {
    setLoadingAction(type);
    try {
      const guide = await generateRouteGuide({
        home_address: user.home_address || '집',
        work_address: user.work_address || '회사',
        commute_type: type,
        weather: {
          precipitation_mm_h: 0,
          probability: 20,
          condition: '맑음',
        },
      });

      setRouteType(type);
      setRouteGuide(guide);
      setShowRoute(true);
    } catch (error) {
      console.error('Error generating route:', error);
      alert('경로 안내를 불러올 수 없습니다');
    } finally {
      setLoadingAction(null);
    }
  };

  const recordSimpleEvent = async (
    type: 'early_leave' | 'vacation' | 'absence'
  ) => {
    setLoadingAction(type);
    try {
      const { error } = await supabase.from('commute_records').insert({
        user_id: user.id,
        date: today,
        type,
        is_on_time: false,
        exp_gained: 0,
      });

      if (error) throw error;
      onChange();
    } catch (error) {
      console.error('Error recording event:', error);
      alert('기록에 실패했습니다');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleArrival = async () => {
    if (!activeRecord) return;
    setLoadingAction('arrive');

    try {
      await recordArrival(user, records, activeRecord);
      onChange();
    } catch (error) {
      console.error('Error recording arrival:', error);
      alert('도착 기록에 실패했습니다');
    } finally {
      setLoadingAction(null);
    }
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const progressPercent = Math.min(
    Math.max(
      ((nowMin - WORK_START_MIN) / (WORK_END_MIN - WORK_START_MIN)) * 100,
      0
    ),
    100
  );

  const elapsedMs = activeRecord
    ? now.getTime() - new Date(activeRecord.start_time!).getTime()
    : 0;

  const activeOrdinal = activeRecord
    ? (activeRecord.type === 'commute' ? commuteCount : returnCount)
    : 0;

  const statusText = activeRecord
    ? activeRecord.type === 'commute'
      ? `${activeOrdinal >= 2 ? `오늘 ${activeOrdinal}번째 ` : ''}출근 중입니다`
      : `${activeOrdinal >= 2 ? `오늘 ${activeOrdinal}번째 ` : ''}퇴근 중입니다`
    : commuteCount > 0 && returnCount === 0
      ? '근무 중입니다'
      : commuteCount > 0 && returnCount > 0
        ? '오늘 근무를 마쳤습니다'
        : '출근 전입니다';

  return (
    <>
      <div className="card relative h-full overflow-hidden p-6 flex flex-col space-y-4">
        <div className="pointer-events-none absolute -right-14 -top-14 size-36 rounded-full bg-gradient-to-br from-sky-100/80 to-indigo-100/30 blur-2xl" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-neutral-900">
            오늘의 근무
          </h3>
          <span className="text-[12px] text-neutral-400">
            {now.toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
              weekday: 'short',
            })}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => requestRoute('commute')}
            disabled={!!loadingAction || !!activeRecord}
            className={`group relative flex min-h-24 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border py-4 text-[12px] font-bold transition-all disabled:cursor-not-allowed ${
              commuteCount > 0
                ? 'border-sky-100 bg-sky-50 text-sky-700 disabled:opacity-60'
                : 'border-sky-500 bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-40'
            }`}
          >
            {commuteCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {commuteCount}
              </span>
            )}
            <span className={`flex size-10 items-center justify-center rounded-xl ring-1 ring-inset ${commuteCount > 0 ? 'bg-white/90 ring-sky-100' : 'bg-white/15 ring-white/20'}`}>
              {loadingAction === 'commute' ? <LoaderCircle className="animate-spin" size={19} /> : commuteCount > 0 ? <Check size={19} strokeWidth={2.5} /> : <TrainFront size={20} strokeWidth={2.1} />}
            </span>
            {loadingAction === 'commute' ? '조회 중...' : '출근하기'}
          </button>

          <button
            onClick={() => requestRoute('return')}
            disabled={!!loadingAction || !!activeRecord}
            className={`group relative flex min-h-24 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border py-4 text-[12px] font-bold transition-all disabled:cursor-not-allowed ${
              returnCount > 0
                ? 'border-indigo-100 bg-indigo-50 text-indigo-700 disabled:opacity-60'
                : 'border-indigo-600 bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-40'
            }`}
          >
            {returnCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-slate-600 text-white text-[10px] font-bold flex items-center justify-center">
                {returnCount}
              </span>
            )}
            <span className={`flex size-10 items-center justify-center rounded-xl ring-1 ring-inset ${returnCount > 0 ? 'bg-white/90 ring-indigo-100' : 'bg-white/15 ring-white/20'}`}>
              {loadingAction === 'return' ? <LoaderCircle className="animate-spin" size={19} /> : returnCount > 0 ? <Check size={19} strokeWidth={2.5} /> : <House size={20} strokeWidth={2.1} />}
            </span>
            {loadingAction === 'return' ? '조회 중...' : '퇴근하기'}
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-neutral-400">09:00</span>
            <span className="text-[13px] font-mono font-semibold text-neutral-800 tabular-nums">
              {activeRecord ? formatElapsed(elapsedMs) : formatClock(now)}
            </span>
            <span className="text-[11px] text-neutral-400">18:00</span>
          </div>
          <div className="relative w-full bg-neutral-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-neutral-500 mt-2 text-center">
            {statusText}
          </p>
        </div>

        {activeRecord && (
          <div className="flex gap-2.5">
            <button
              onClick={() => router.push('/map')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-[12px] text-[13px] font-semibold transition-colors"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-white text-blue-600 ring-1 ring-blue-100"><MapPin size={15} strokeWidth={2.25} /></span>
              위치
            </button>
            <button
              onClick={handleArrival}
              disabled={loadingAction === 'arrive'}
              className="flex-1 flex items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-emerald-200 transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/20">{loadingAction === 'arrive' ? <LoaderCircle className="animate-spin" size={16} /> : <PartyPopper size={16} />}</span>
              {loadingAction === 'arrive' ? '기록 중...' : '무사 도착!'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={() => recordSimpleEvent('early_leave')}
            disabled={!!loadingAction}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-[12px] font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-white text-amber-700 ring-1 ring-amber-100"><Clock3 size={15} strokeWidth={2.25} /></span>
            {loadingAction === 'early_leave' ? '기록 중...' : '조퇴'}
          </button>

          <button
            onClick={() => recordSimpleEvent('vacation')}
            disabled={!!loadingAction}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 py-2.5 text-[12px] font-bold text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-50"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-white text-teal-700 ring-1 ring-teal-100"><Palmtree size={15} strokeWidth={2.25} /></span>
            {loadingAction === 'vacation' ? '기록 중...' : '휴가'}
          </button>
        </div>
      </div>

      {showRoute && routeGuide && (
        <RouteModal
          guide={routeGuide}
          user={user}
          type={routeType}
          onClose={() => setShowRoute(false)}
          onDeparted={async () => {
            setShowRoute(false);
            await onChange();
            router.push('/map');
          }}
        />
      )}
    </>
  );
}
