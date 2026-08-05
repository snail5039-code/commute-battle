'use client';

import { useEffect, useState } from 'react';
import { useAppData } from '@/lib/useAppData';
import { supabase } from '@/lib/supabase';
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
} from '@/lib/notifications';
import TopBar from '@/components/TopBar';

export default function SettingsPage() {
  const { user, loading, refetch } = useAppData();
  const [homeAddr, setHomeAddr] = useState('');
  const [workAddr, setWorkAddr] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [petQuiet, setPetQuiet] = useState(false);
  const [notifPermission, setNotifPermission] = useState<
    NotificationPermission | 'unsupported'
  >('unsupported');

  useEffect(() => {
    if (user) {
      setHomeAddr(user.home_address || '');
      setWorkAddr(user.work_address || '');
    }
  }, [user]);

  useEffect(() => {
    setPetQuiet(localStorage.getItem('petQuiet') === 'true');
    setNotifPermission(getNotificationPermission());
  }, []);

  const togglePetQuiet = () => {
    const next = !petQuiet;
    setPetQuiet(next);
    localStorage.setItem('petQuiet', String(next));
  };

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
  };

  if (loading) return null;
  if (!user) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopBar title="설정" />
        <div className="p-8 text-sm text-neutral-500">
          홈에서 먼저 시작해주세요.
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          home_address: homeAddr,
          work_address: workAddr,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      await refetch();
      setSaved(true);
    } catch (error) {
      console.error('Error saving address:', error);
      alert('주소 저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('모든 기록이 이 기기와 연결이 끊깁니다. 계속할까요?')) return;
    localStorage.removeItem('userId');
    window.location.href = '/';
  };

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="설정" subtitle="주소와 계정 관리" />

      <div className="flex-1 p-4 md:p-8 max-w-md">
        <div className="card p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-neutral-600 mb-1.5">
              집 주소
            </label>
            <input
              type="text"
              value={homeAddr}
              onChange={(e) => setHomeAddr(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-[10px] text-[13px] focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-neutral-600 mb-1.5">
              회사 주소
            </label>
            <input
              type="text"
              value={workAddr}
              onChange={(e) => setWorkAddr(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-[10px] text-[13px] focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-[10px] text-[13px] font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : saved ? '저장됨 ✓' : '저장'}
          </button>
        </div>

        <div className="mt-6 card p-6 flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-neutral-900 mb-1">
              캐릭터 조용히 모드
            </h3>
            <p className="text-[12px] text-neutral-500">
              캐릭터가 먼저 말 거는 선톡을 끕니다.
            </p>
          </div>
          <button
            onClick={togglePetQuiet}
            className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
              petQuiet ? 'bg-neutral-300' : 'bg-blue-500'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                petQuiet ? 'translate-x-0.5' : 'translate-x-5'
              }`}
            />
          </button>
        </div>

        <div className="mt-6 card p-6 flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-neutral-900 mb-1">
              브라우저 알림
            </h3>
            <p className="text-[12px] text-neutral-500">
              탭이 열려있는 동안 잔소리·칭찬을 OS 알림으로도 받습니다.
            </p>
          </div>
          {isNotificationSupported() ? (
            notifPermission === 'granted' ? (
              <span className="text-[12px] font-semibold text-blue-600 shrink-0">
                켜짐
              </span>
            ) : notifPermission === 'denied' ? (
              <span className="text-[12px] font-semibold text-neutral-400 shrink-0">
                차단됨
              </span>
            ) : (
              <button
                onClick={handleEnableNotifications}
                className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 shrink-0"
              >
                켜기
              </button>
            )
          ) : (
            <span className="text-[12px] text-neutral-400 shrink-0">
              미지원 브라우저
            </span>
          )}
        </div>

        <div className="mt-6 card p-6">
          <h3 className="text-[13px] font-semibold text-neutral-900 mb-1">
            기기 연결 해제
          </h3>
          <p className="text-[12px] text-neutral-500 mb-3">
            이 기기에서 로그아웃하고 처음 화면으로 돌아갑니다.
          </p>
          <button
            onClick={handleReset}
            className="text-[13px] font-semibold text-red-600 hover:text-red-700"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
