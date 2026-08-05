'use client';

import { useState } from 'react';
import { Siren } from 'lucide-react';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';

interface InitModalProps {
  onComplete: () => void;
}

export default function InitModal({ onComplete }: InitModalProps) {
  const { setUser } = useStore();
  const [homeAddr, setHomeAddr] = useState('');
  const [workAddr, setWorkAddr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userId = 'temp_' + Date.now();

      const { data, error } = await supabase
        .from('users')
        .insert({
          id: userId,
          home_address: homeAddr,
          work_address: workAddr,
          character_level: 1,
          character_exp: 0,
          character_stage: 'alg',
          total_commute_starts: 0,
          total_commute_arrivals: 0,
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error.message, error);
        throw error;
      }

      if (!data) {
        console.error('No data returned from insert');
        throw new Error('No data returned');
      }

      setUser(data as User);
      localStorage.setItem('userId', userId);
      onComplete();
    } catch (error) {
      console.error(
        'Error initializing:',
        (error as { message?: string })?.message || error
      );
      alert('초기 설정에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#f5f6f8]">
      <div className="card p-8 max-w-sm w-full mx-4">
        <div className="w-10 h-10 rounded-[10px] bg-gradient-to-b from-blue-500 to-blue-600 flex items-center justify-center shadow-sm mx-auto mb-4">
          <Siren size={20} className="text-white" strokeWidth={2.25} />
        </div>
        <h1 className="text-xl font-semibold text-center text-neutral-900">
          출퇴근전쟁봇
        </h1>
        <p className="text-sm text-neutral-500 text-center mt-1 mb-6">
          출퇴근을 게임처럼 즐기세요
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">
              집 주소
            </label>
            <input
              type="text"
              value={homeAddr}
              onChange={(e) => setHomeAddr(e.target.value)}
              placeholder="예: 서울시 강남구 테헤란로 123"
              required
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">
              회사 주소
            </label>
            <input
              type="text"
              value={workAddr}
              onChange={(e) => setWorkAddr(e.target.value)}
              placeholder="예: 서울시 서초구 강남대로 456"
              required
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2.5 rounded-[10px] transition-colors disabled:opacity-50"
          >
            {loading ? '설정 중...' : '시작하기'}
          </button>
        </form>

        <p className="text-xs text-neutral-400 text-center mt-6">
          이 서비스는 개인용 기록 도구입니다.
        </p>
      </div>
    </div>
  );
}
