'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Home, LogOut, MapPin, MonitorCog, Sparkles } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { supabase } from '@/lib/supabase';
import { getNotificationPermission, isNotificationSupported, requestNotificationPermission } from '@/lib/notifications';
import TopBar from '@/components/TopBar';

type Preference = 'compact' | 'contrast' | 'motion';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-slate-200'}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function SettingRow({ title, description, control }: { title: string; description: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-5 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0"><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p></div>
      {control}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, refetch } = useAppData();
  const [homeAddr, setHomeAddr] = useState<string | null>(null);
  const [workAddr, setWorkAddr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [petQuiet, setPetQuiet] = useState(() => typeof window !== 'undefined' && localStorage.getItem('petQuiet') === 'true');
  const [preferences, setPreferences] = useState<Record<Preference, boolean>>(() => ({
    compact: typeof window !== 'undefined' && localStorage.getItem('uiCompact') === 'true',
    contrast: typeof window !== 'undefined' && localStorage.getItem('uiContrast') === 'true',
    motion: typeof window !== 'undefined' && localStorage.getItem('uiReducedMotion') === 'true',
  }));
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => getNotificationPermission());

  const togglePreference = (key: Preference) => {
    const next = !preferences[key];
    setPreferences((current) => ({ ...current, [key]: next }));
    const storageKey = { compact: 'uiCompact', contrast: 'uiContrast', motion: 'uiReducedMotion' }[key];
    localStorage.setItem(storageKey, String(next));
    const attribute = { compact: 'density', contrast: 'contrast', motion: 'motion' }[key];
    document.documentElement.dataset[attribute] = next ? (key === 'compact' ? 'compact' : key === 'contrast' ? 'high' : 'reduced') : '';
  };

  const togglePetQuiet = () => {
    const next = !petQuiet;
    setPetQuiet(next);
    localStorage.setItem('petQuiet', String(next));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true); setStatus('');
    try {
      const { error } = await supabase.from('users').update({ home_address: (homeAddr ?? user.home_address ?? '').trim(), work_address: (workAddr ?? user.work_address ?? '').trim(), updated_at: new Date().toISOString() }).eq('id', user.id);
      if (error) throw error;
      await refetch();
      setStatus('주소를 저장했습니다.');
    } catch (error) {
      console.error('Error saving address:', error);
      setStatus('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally { setSaving(false); }
  };

  const handleReset = () => {
    if (!confirm('이 기기에서 로그아웃할까요? 기록은 계정에 안전하게 남아 있습니다.')) return;
    localStorage.removeItem('userId');
    router.push('/');
    router.refresh();
  };

  if (loading) return <div className="min-h-screen"><TopBar title="설정" /><div className="shell-content p-5 md:p-8"><div className="card h-52 animate-pulse bg-slate-100" /></div></div>;
  if (!user) return (
    <div className="min-h-screen"><TopBar title="설정" subtitle="내 출퇴근 환경을 관리하세요" />
      <div className="shell-content p-5 md:p-8"><div className="card max-w-xl p-7"><h2 className="text-lg font-bold text-slate-950">로그인이 필요해요</h2><p className="mt-2 text-sm text-slate-500">주소와 알림 설정을 저장하려면 먼저 시작해 주세요.</p><Link href="/login" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">로그인하기</Link></div></div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <TopBar title="설정" subtitle="내 출퇴근 환경과 화면을 편하게 맞춰보세요" />
      <div className="shell-content grid gap-5 p-5 md:grid-cols-2 md:p-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,.85fr)]">
        <section className="card p-5 md:p-7" aria-labelledby="route-title">
          <div className="mb-6 flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><MapPin size={20} /></span><div><h2 id="route-title" className="font-bold text-slate-950">출퇴근 경로</h2><p className="mt-1 text-xs text-slate-500">경로 안내와 기록에 사용할 기본 주소예요.</p></div></div>
          <div className="space-y-4">
            <label className="block"><span className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700"><Home size={14} />집 주소</span><input type="text" autoComplete="street-address" value={homeAddr ?? user.home_address ?? ''} onChange={(e) => setHomeAddr(e.target.value)} placeholder="예: 서울시 마포구 월드컵로" className="settings-control w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
            <label className="block"><span className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700"><MapPin size={14} />회사 주소</span><input type="text" autoComplete="organization" value={workAddr ?? user.work_address ?? ''} onChange={(e) => setWorkAddr(e.target.value)} placeholder="예: 서울시 강남구 테헤란로" className="settings-control w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
            <div className="flex flex-wrap items-center gap-3 pt-1"><button type="button" onClick={handleSave} disabled={saving} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? '저장 중…' : '주소 저장'}</button><p role="status" aria-live="polite" className={`text-xs ${status.includes('못') ? 'text-red-600' : 'text-emerald-700'}`}>{status}</p></div>
          </div>
        </section>

        <section className="card p-5 md:p-7" aria-labelledby="notice-title">
          <div className="mb-5 flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Bell size={20} /></span><div><h2 id="notice-title" className="font-bold text-slate-950">알림과 캐릭터</h2><p className="mt-1 text-xs text-slate-500">집중을 방해하지 않도록 알림을 조절하세요.</p></div></div>
          <div className="divide-y divide-slate-100">
            <SettingRow title="캐릭터 조용히" description="캐릭터의 먼저 거는 말과 OS 알림을 멈춥니다." control={<Switch checked={petQuiet} onChange={togglePetQuiet} label="캐릭터 조용히 모드" />} />
            <SettingRow title="브라우저 알림" description="필요한 출퇴근 안내를 기기 알림으로 받습니다." control={isNotificationSupported() ? notifPermission === 'granted' ? <span className="text-xs font-bold text-emerald-700">허용됨</span> : notifPermission === 'denied' ? <span className="text-xs font-bold text-slate-400">차단됨</span> : <button type="button" onClick={async () => setNotifPermission(await requestNotificationPermission())} className="min-h-10 rounded-xl bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100">알림 켜기</button> : <span className="text-xs text-slate-400">지원 안 함</span>} />
          </div>
        </section>

        <section className="card p-5 md:col-span-2 md:p-7 xl:col-span-1" aria-labelledby="display-title">
          <div className="mb-5 flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><MonitorCog size={20} /></span><div><h2 id="display-title" className="font-bold text-slate-950">화면 편의</h2><p className="mt-1 text-xs text-slate-500">이 기기에만 저장되며 비용 없이 바로 적용됩니다.</p></div></div>
          <div className="divide-y divide-slate-100">
            <SettingRow title="간결한 화면" description="카드와 메뉴의 간격을 줄여 더 많은 내용을 봅니다." control={<Switch checked={preferences.compact} onChange={() => togglePreference('compact')} label="간결한 화면" />} />
            <SettingRow title="고대비 텍스트" description="본문과 경계선의 대비를 높여 읽기 쉽게 합니다." control={<Switch checked={preferences.contrast} onChange={() => togglePreference('contrast')} label="고대비 텍스트" />} />
            <SettingRow title="동작 줄이기" description="캐릭터와 화면 전환 애니메이션을 최소화합니다." control={<Switch checked={preferences.motion} onChange={() => togglePreference('motion')} label="동작 줄이기" />} />
          </div>
        </section>

        <section className="card flex flex-col justify-between gap-6 p-5 md:col-span-2 md:p-7 xl:col-span-1" aria-labelledby="account-title">
          <div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Sparkles size={20} /></span><div><h2 id="account-title" className="font-bold text-slate-950">내 기록</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">로그아웃해도 저장된 출퇴근 기록과 캐릭터 성장은 사라지지 않습니다.</p></div></div>
          <button type="button" onClick={handleReset} className="flex min-h-11 w-fit items-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-600 transition hover:bg-red-50"><LogOut size={17} />이 기기에서 로그아웃</button>
        </section>
      </div>
    </div>
  );
}
