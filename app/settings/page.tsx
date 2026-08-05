'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SettingsSections from '@/components/SettingsSections';
import NotificationSettingsPanel from '@/components/NotificationSettingsPanel';
import TopBar from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import { loadWorkSchedule, saveWorkSchedule, useStore } from '@/lib/store';
import type { User, WorkSchedule } from '@/lib/types';
import { useAppData } from '@/lib/useAppData';

export default function SettingsPage() {
  const { user, loading, refetch } = useAppData();
  if (loading) return <div className="min-h-screen"><TopBar title="설정"/><main className="shell-content p-5 md:p-8"><div className="card h-52 animate-pulse bg-slate-100" aria-label="설정을 불러오는 중"/></main></div>;
  if (!user) return <div className="min-h-screen"><TopBar title="설정"/><main className="shell-content p-5 md:p-8"><div className="card max-w-xl p-7"><h2 className="text-lg font-bold">로그인이 필요해요</h2><p className="mt-2 text-sm text-slate-500">설정을 저장하려면 먼저 로그인해 주세요.</p><Link href="/login" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">로그인하기</Link></div></main></div>;
  return <SettingsForm key={user.id} user={user} refetch={refetch}/>;
}

function SettingsForm({ user, refetch }: { user: User; refetch: () => Promise<void> }) {
  const setStoredSchedule = useStore((state) => state.setWorkSchedule);
  const [homeAddress, setHomeAddress] = useState(user.home_address ?? '');
  const [workAddress, setWorkAddress] = useState(user.work_address ?? '');
  const [schedule, setSchedule] = useState<WorkSchedule>(() => loadWorkSchedule(user.id));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => { setStoredSchedule(schedule); }, [schedule, setStoredSchedule]);

  const save = async () => {
    const startMinutes = schedule.startTime.split(':').map(Number).reduce((hours, minutes) => hours * 60 + minutes);
    const endMinutes = schedule.endTime.split(':').map(Number).reduce((hours, minutes) => hours * 60 + minutes);
    if (endMinutes <= startMinutes) { setStatus('퇴근 시각은 출근 시각보다 늦어야 합니다.'); return; }
    setSaving(true); setStatus('');
    try {
      const { error } = await supabase.from('users').update({ home_address: homeAddress.trim(), work_address: workAddress.trim(), updated_at: new Date().toISOString() }).eq('id', user.id);
      if (error) throw error;
      const saved = saveWorkSchedule(user.id, schedule);
      setSchedule(saved); setStoredSchedule(saved);
      await refetch();
      setStatus('주소와 근무 설정을 저장했습니다.');
    } catch (error) {
      console.error('Error saving settings:', error);
      setStatus('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally { setSaving(false); }
  };

  return <div className="min-h-screen"><TopBar title="설정" subtitle="근무, 경로, 알림과 개인정보를 관리해요"/><main className="shell-content p-4 md:p-8"><SettingsSections userId={user.id} homeAddress={homeAddress} workAddress={workAddress} schedule={schedule} saving={saving} status={status} onHomeAddressChange={setHomeAddress} onWorkAddressChange={setWorkAddress} onScheduleChange={setSchedule} onSave={save} notificationPanel={<NotificationSettingsPanel/>} /></main></div>;
}
