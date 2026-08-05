'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, Clock, Palmtree, Check, MapPin } from 'lucide-react';
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
  const commuteDone = records.some(
    (r) => r.date === today && r.type === 'commute'
  );
  const returnDone = records.some(
    (r) => r.date === today && r.type === 'return'
  );

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

  const statusText = activeRecord
    ? activeRecord.type === 'commute'
      ? '출근 중입니다'
      : '퇴근 중입니다'
    : commuteDone && !returnDone
      ? '근무 중입니다'
      : commuteDone && returnDone
        ? '오늘 근무를 마쳤습니다'
        : '출근 전입니다';

  return (
    <>
      <div className="card p-6 h-full flex flex-col space-y-4">
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
            disabled={!!loadingAction || commuteDone || !!activeRecord}
            className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-[14px] text-[12px] font-semibold transition-colors disabled:cursor-not-allowed ${
              commuteDone
                ? 'bg-blue-50 text-blue-400'
                : 'bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40'
            }`}
          >
            {commuteDone ? <Check size={18} strokeWidth={2.5} /> : <LogIn size={18} strokeWidth={2} />}
            {loadingAction === 'commute' ? '조회 중...' : '출근하기'}
          </button>

          <button
            onClick={() => requestRoute('return')}
            disabled={!!loadingAction || returnDone || !!activeRecord}
            className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-[14px] text-[12px] font-semibold transition-colors disabled:cursor-not-allowed ${
              returnDone
                ? 'bg-slate-100 text-slate-400'
                : 'bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-40'
            }`}
          >
            {returnDone ? <Check size={18} strokeWidth={2.5} /> : <LogOut size={18} strokeWidth={2} />}
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
              <MapPin size={15} strokeWidth={2.25} />
              위치
            </button>
            <button
              onClick={handleArrival}
              disabled={loadingAction === 'arrive'}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[12px] text-[13px] font-semibold disabled:opacity-50 transition-colors"
            >
              {loadingAction === 'arrive' ? '기록 중...' : '도착'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={() => recordSimpleEvent('early_leave')}
            disabled={!!loadingAction}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-[10px] text-[12px] font-semibold disabled:opacity-50 transition-colors"
          >
            <Clock size={15} strokeWidth={2.25} />
            {loadingAction === 'early_leave' ? '기록 중...' : '조퇴'}
          </button>

          <button
            onClick={() => recordSimpleEvent('vacation')}
            disabled={!!loadingAction}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-[10px] text-[12px] font-semibold disabled:opacity-50 transition-colors"
          >
            <Palmtree size={15} strokeWidth={2.25} />
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
