'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock3, Home, MapPin } from 'lucide-react';
import TopBar from '@/components/TopBar';
import { useAppData } from '@/lib/useAppData';
import { supabase } from '@/lib/supabase';
import { getWorkdaySchedule, loadWorkSchedule, saveWorkSchedule, useStore } from '@/lib/store';
import { User, WorkSchedule, WorkdayMode } from '@/lib/types';

const WEEKDAYS = [
  { day: 1, label: '월' }, { day: 2, label: '화' }, { day: 3, label: '수' },
  { day: 4, label: '목' }, { day: 5, label: '금' },
];

const modeLabel: Record<WorkdayMode, string> = { office: '출근', remote: '재택', off: '휴무' };

export default function SettingsPage() {
  const { user, loading, refetch } = useAppData();
  if (loading) return <div className="min-h-screen"><TopBar title="설정" /><div className="shell-content p-5 md:p-8"><div className="card h-52 animate-pulse bg-slate-100" /></div></div>;
  if (!user) return (
    <div className="min-h-screen"><TopBar title="설정" /><div className="shell-content p-5 md:p-8"><div className="card max-w-xl p-7"><h2 className="text-lg font-bold">로그인이 필요해요</h2><Link href="/login" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">로그인하기</Link></div></div></div>
  );
  return <SettingsForm key={user.id} user={user} refetch={refetch} />;
}

function SettingsForm({ user, refetch }: { user: User; refetch: () => Promise<void> }) {
  const setStoredSchedule = useStore((state) => state.setWorkSchedule);
  const [homeAddr, setHomeAddr] = useState(user.home_address ?? '');
  const [workAddr, setWorkAddr] = useState(user.work_address ?? '');
  const [schedule, setSchedule] = useState<WorkSchedule>(() => loadWorkSchedule(user.id));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setStoredSchedule(schedule);
  }, [schedule, setStoredSchedule]);

  const setMode = (day: number, mode: WorkdayMode) => {
    setSchedule((current) => ({
      ...current,
      overrides: {
        ...current.overrides,
        [day]: mode === 'office' ? undefined : { mode },
      },
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
    const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
    if (endHour * 60 + endMinute <= startHour * 60 + startMinute) {
      setStatus('퇴근 시각은 출근 시각보다 늦어야 합니다.');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const { error } = await supabase.from('users').update({
        home_address: homeAddr.trim(),
        work_address: workAddr.trim(),
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (error) throw error;
      const saved = saveWorkSchedule(user.id, schedule);
      setStoredSchedule(saved);
      await refetch();
      setStatus('주소와 근무시간을 저장했습니다.');
    } catch (error) {
      console.error('Error saving settings:', error);
      setStatus('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <TopBar title="설정" subtitle="주소와 나의 근무시간을 관리하세요" />
      <div className="shell-content grid gap-5 p-5 md:grid-cols-2 md:p-8">
        <section className="card p-5 md:p-7" aria-labelledby="route-title">
          <div className="mb-6 flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><MapPin size={20} /></span><div><h2 id="route-title" className="font-bold">출퇴근 경로</h2><p className="mt-1 text-xs text-slate-500">경로 안내에 사용할 기본 주소입니다.</p></div></div>
          <div className="space-y-4">
            <label className="block"><span className="mb-2 flex items-center gap-1.5 text-xs font-bold"><Home size={14} />집 주소</span><input className="settings-control w-full rounded-xl border border-slate-200 px-3.5 text-sm" value={homeAddr} onChange={(event) => setHomeAddr(event.target.value)} /></label>
            <label className="block"><span className="mb-2 flex items-center gap-1.5 text-xs font-bold"><MapPin size={14} />회사 주소</span><input className="settings-control w-full rounded-xl border border-slate-200 px-3.5 text-sm" value={workAddr} onChange={(event) => setWorkAddr(event.target.value)} /></label>
          </div>
        </section>

        <section className="card p-5 md:p-7" aria-labelledby="schedule-title">
          <div className="mb-6 flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Clock3 size={20} /></span><div><h2 id="schedule-title" className="font-bold">근무시간</h2><p className="mt-1 text-xs text-slate-500">평일 공통 시각과 요일별 근무 형태를 설정합니다.</p></div></div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold">출근 시각<input type="time" value={schedule.startTime} onChange={(event) => setSchedule((current) => ({ ...current, startTime: event.target.value }))} className="settings-control mt-2 w-full rounded-xl border border-slate-200 px-3" /></label>
            <label className="text-xs font-bold">퇴근 시각<input type="time" value={schedule.endTime} onChange={(event) => setSchedule((current) => ({ ...current, endTime: event.target.value }))} className="settings-control mt-2 w-full rounded-xl border border-slate-200 px-3" /></label>
          </div>
          <div className="mt-5 space-y-2">
            {WEEKDAYS.map(({ day, label }) => {
              const currentMode = getWorkdaySchedule(schedule, new Date(2024, 0, day)).mode;
              return <div key={day} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"><span className="text-sm font-bold">{label}요일</span><div className="flex gap-1">{(['office', 'remote', 'off'] as WorkdayMode[]).map((mode) => <button key={mode} type="button" onClick={() => setMode(day, mode)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${currentMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>{modeLabel[mode]}</button>)}</div></div>;
            })}
          </div>
        </section>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleSave} disabled={saving} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white disabled:opacity-60">{saving ? '저장 중…' : '설정 저장'}</button>
          <p role="status" aria-live="polite" className={`text-xs ${status.includes('못했습니다') || status.includes('늦어야') ? 'text-red-600' : 'text-emerald-700'}`}>{status}</p>
        </div>
      </div>
    </div>
  );
}
