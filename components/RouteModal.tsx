'use client';

import { useState } from 'react';
import { localDateKey } from '@/lib/date';
import { User, RouteGuideResponse } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { DepartureRecommendation as Recommendation } from '@/lib/weather';
import DepartureRecommendation from './DepartureRecommendation';

interface RouteModalProps {
  guide: RouteGuideResponse;
  user: User;
  type: 'commute' | 'return';
  onClose: () => void;
  onDeparted: () => void;
  recommendation: Recommendation;
}

const DIFFICULTY_STYLES: Record<string, string> = {
  peaceful: 'bg-emerald-50 text-emerald-700',
  caution: 'bg-yellow-50 text-yellow-700',
  alert: 'bg-orange-50 text-orange-700',
  danger: 'bg-red-50 text-red-700',
};

function RouteVisual({ type }: { type: 'commute' | 'return' }) {
  return (
    <div className="relative h-24 rounded-[14px] bg-gradient-to-br from-blue-50 via-slate-50 to-blue-50 overflow-hidden">
      <svg
        viewBox="0 0 320 96"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
      >
        <path
          d="M 24 68 C 90 68, 110 24, 170 30 C 220 35, 230 66, 296 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeDasharray="6 6"
          strokeLinecap="round"
        />
        <circle cx="24" cy="68" r="5" fill="#0f172a" />
        <circle cx="296" cy="24" r="5" fill="#3b82f6" />
      </svg>
      <span className="absolute left-4 bottom-2 text-[10px] font-medium text-neutral-500">
        {type === 'commute' ? '집' : '회사'}
      </span>
      <span className="absolute right-4 top-2 text-[10px] font-medium text-blue-600">
        {type === 'commute' ? '회사' : '집'}
      </span>
    </div>
  );
}

export default function RouteModal({
  guide,
  user,
  type,
  onClose,
  onDeparted,
  recommendation,
}: RouteModalProps) {
  const [loading, setLoading] = useState(false);

  const handleDeparture = async () => {
    setLoading(true);

    try {
      const today = localDateKey(new Date());

      const { error } = await supabase.from('commute_records').insert({
        user_id: user.id,
        date: today,
        type,
        commute_subtype: 'start',
        start_time: new Date().toISOString(),
        is_on_time: false,
        exp_gained: 0,
      });

      if (error) throw error;
      onDeparted();
    } catch (error) {
      console.error('Error starting commute:', error);
      alert('기록 저장에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="card max-w-md w-full p-6 space-y-5">
        <h3 className="text-[13px] font-semibold text-neutral-400">
          {type === 'commute' ? '출근 경로 안내' : '퇴근 경로 안내'}
        </h3>

        <RouteVisual type={type} />

        <div
          className={`p-3.5 rounded-[12px] text-[13px] font-medium leading-relaxed ${DIFFICULTY_STYLES[guide.difficulty]}`}
        >
          {guide.message}
        </div>

        <DepartureRecommendation recommendation={recommendation} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] text-neutral-400">경로</p>
            <p className="text-[14px] font-semibold text-neutral-900 mt-0.5">
              {guide.route}
            </p>
          </div>

          <div>
            <p className="text-[11px] text-neutral-400">추천 출발</p>
            <p className="text-[14px] font-semibold text-neutral-900 mt-0.5">
              {recommendation.departureTime} 출발
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-[12px] text-[13px] font-semibold transition-colors"
          >
            취소
          </button>

          <button
            onClick={handleDeparture}
            disabled={loading}
            className="flex-1 py-2.5 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-[12px] text-[13px] font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? '기록 중...' : '출발'}
          </button>
        </div>
      </div>
    </div>
  );
}
