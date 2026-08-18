'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bell, Bot, BriefcaseBusiness, Cat, MapPinned, Palette, Search, ShieldCheck } from 'lucide-react';
import { clearRouteLearning, isRouteLearningEnabled, setRouteLearningEnabled } from '@/lib/routeLearning';
import { getRoutePreference, saveRoutePreference, type RoutePreference } from '@/lib/routePreferences';
import { DEFAULT_PET_ID, PET_CATALOG, PET_IDS, readStoredPetId, storePetId, type PetId } from '@/lib/petCatalog';
import {
  clearAiLocalData, clearAllLocalSettings, DEFAULT_LOCAL_SETTINGS, DEFAULT_WORK_SCHEDULE,
  getWorkdaySchedule, loadLocalSettings, saveLocalSettings, type LocalSettings,
} from '@/lib/store';
import type { WorkSchedule, WorkdayMode } from '@/lib/types';
import { mondayOfWeek } from '@/lib/date';
import LogoutButton from './LogoutButton';
import { loadTheme, saveTheme, type AppTheme } from '@/lib/theme';
import DeleteAccountPanel from './DeleteAccountPanel';
import RemoteWorkPanel from './RemoteWorkPanel';
import LeavePanel from './LeavePanel';

export type SettingsSectionId = 'work' | 'route' | 'appearance' | 'notifications' | 'pet' | 'ai-privacy' | 'account';

export const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; label: string; icon: typeof BriefcaseBusiness }> = [
  { id: 'work', label: '근무', icon: BriefcaseBusiness },
  { id: 'route', label: '경로', icon: MapPinned },
  { id: 'appearance', label: '화면', icon: Palette },
  { id: 'notifications', label: '알림', icon: Bell },
  { id: 'pet', label: '펫', icon: Cat },
  { id: 'ai-privacy', label: 'AI·개인정보', icon: Bot },
  { id: 'account', label: '계정', icon: ShieldCheck },
];

const weekdays = [
  { day: 1, label: '월' }, { day: 2, label: '화' }, { day: 3, label: '수' },
  { day: 4, label: '목' }, { day: 5, label: '금' }, { day: 6, label: '토' }, { day: 0, label: '일' },
];
// weekdays의 day(0=일~6=토) 기준 이번 주 날짜를 "M.D"로 보여주기 위한 오프셋(월요일=0)
function weekdayDateLabel(day: number, monday: Date) {
  const offset = day === 0 ? 6 : day - 1;
  const date = new Date(monday);
  date.setDate(monday.getDate() + offset);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}
const modeLabel: Record<WorkdayMode, string> = { office: '출근', remote: '재택', off: '휴무' };
const petLabel: Record<PetId, string> = { cat: '고양이', dog: '강아지', rabbit: '토끼', bird: '새', turtle: '거북이' };

function ConfirmAction({ label, confirmLabel, onConfirm, tone = 'neutral' }: { label: string; confirmLabel: string; onConfirm: () => void; tone?: 'neutral' | 'danger' }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button type="button" onClick={() => setConfirming(true)} className={`min-h-11 rounded-xl border px-4 text-sm font-bold ${tone === 'danger' ? 'border-red-200 text-red-700' : 'border-slate-200 text-slate-700'}`}>{label}</button>;
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3" role="group" aria-label={`${label} 확인`}>
    <span className="text-xs font-semibold text-amber-900">되돌릴 수 없습니다. 계속할까요?</span>
    <button type="button" onClick={() => { onConfirm(); setConfirming(false); }} className={`min-h-10 rounded-lg px-3 text-xs font-bold text-white ${tone === 'danger' ? 'bg-red-600' : 'bg-slate-800'}`}>{confirmLabel}</button>
    <button type="button" onClick={() => setConfirming(false)} className="min-h-10 rounded-lg px-3 text-xs font-bold text-slate-600">취소</button>
  </div>;
}

export function NotificationSettingsSlot({ children }: { children?: ReactNode }) {
  return <div data-settings-slot="notifications">
    {children ?? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600"><p className="font-bold text-slate-800">웹 푸시 알림</p><p className="mt-1 leading-6">알림 설정 패널이 준비되면 이 영역에서 출발 알림과 권한을 관리할 수 있습니다.</p></div>}
  </div>;
}

interface DaumPostcodeData {
  roadAddress: string;
  jibunAddress: string;
  zonecode: string;
  buildingName?: string;
  apartment?: 'Y' | 'N';
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: { oncomplete: (data: DaumPostcodeData) => void }) => { open: () => void };
    };
  }
}

let postcodeScriptPromise: Promise<void> | null = null;

function loadDaumPostcode() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브라우저에서만 주소 검색을 사용할 수 있습니다.'));
  }
  if (window.daum?.Postcode) return Promise.resolve();
  if (!postcodeScriptPromise) {
    postcodeScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('주소 검색 서비스를 불러오지 못했습니다.'));
      document.head.appendChild(script);
    });
  }
  return postcodeScriptPromise;
}

interface SettingsSectionsProps {
  userId: string;
  homeAddress: string;
  workAddress: string;
  schedule: WorkSchedule;
  saving: boolean;
  status: string;
  onHomeAddressChange: (value: string) => void;
  onWorkAddressChange: (value: string) => void;
  onScheduleChange: (value: WorkSchedule) => void;
  onSave: () => void;
  notificationPanel?: ReactNode;
}

export default function SettingsSections(props: SettingsSectionsProps) {
  const [active, setActive] = useState<SettingsSectionId>('work');
  const [preference, setPreference] = useState<RoutePreference>('fastest');
  const [learning, setLearning] = useState(true);
  const [petId, setPetId] = useState<PetId>(DEFAULT_PET_ID);
  const [localSettings, setLocalSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [localStatus, setLocalStatus] = useState('');
  const [addressSearchLoading, setAddressSearchLoading] = useState<'home' | 'work' | null>(null);
  const [theme, setTheme] = useState<AppTheme>('dark');

  useEffect(() => {
    const load = () => {
      const fromHash = window.location.hash.slice(1) as SettingsSectionId;
      if (SETTINGS_SECTIONS.some((section) => section.id === fromHash)) setActive(fromHash);
      setPreference(getRoutePreference());
      setLearning(isRouteLearningEnabled());
      setPetId(readStoredPetId());
      setLocalSettings(loadLocalSettings(props.userId));
      setTheme(loadTheme());
    };
    queueMicrotask(load);
    window.addEventListener('hashchange', load);
    return () => window.removeEventListener('hashchange', load);
  }, [props.userId]);

  const selectSection = (id: SettingsSectionId) => {
    setActive(id);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`);
  };
  const monday = mondayOfWeek(new Date());
  // office를 override 삭제(undefined)로 처리하면 기본값이 office인 평일에서만 맞는 지름길이었다.
  // 주말은 기본값이 off라서 그 지름길을 쓰면 "출근" 선택이 다시 off로 되돌아가 버리므로
  // 항상 명시적으로 저장한다.
  const setMode = (day: number, mode: WorkdayMode) => props.onScheduleChange({
    ...props.schedule,
    overrides: { ...props.schedule.overrides, [day]: { mode } },
  });
  const updateLocalSettings = (next: LocalSettings) => {
    setLocalSettings(saveLocalSettings(props.userId, next));
    setLocalStatus('설정을 이 기기에 저장했습니다.');
  };
  const resetAll = () => {
    clearAllLocalSettings(props.userId);
    props.onScheduleChange({ ...DEFAULT_WORK_SCHEDULE, overrides: {} });
    setPreference('fastest'); setLearning(true); setPetId(DEFAULT_PET_ID); setLocalSettings(DEFAULT_LOCAL_SETTINGS); setTheme('dark'); saveTheme('dark');
    setLocalStatus('이 기기의 앱 설정을 모두 초기화했습니다. 주소와 계정 데이터는 삭제하지 않았습니다.');
  };

  const openAddressSearch = async (target: 'home' | 'work') => {
    setAddressSearchLoading(target);
    try {
      await loadDaumPostcode();
      if (!window.daum?.Postcode) throw new Error('주소 검색 서비스를 사용할 수 없습니다.');
      new window.daum.Postcode({
        oncomplete: (data) => {
          const address = data.roadAddress || data.jibunAddress;
          const building = data.buildingName && data.apartment === 'Y' ? ` (${data.buildingName})` : '';
          const nextAddress = `${address}${building}`.trim();
          if (target === 'home') props.onHomeAddressChange(nextAddress);
          else props.onWorkAddressChange(nextAddress);
          setLocalStatus('주소를 선택했습니다. 저장 버튼을 눌러 반영해 주세요.');
        },
      }).open();
    } catch (error) {
      setLocalStatus(error instanceof Error ? error.message : '주소 검색을 열지 못했습니다.');
    } finally {
      setAddressSearchLoading(null);
    }
  };

  return <div className="grid gap-5 xl:grid-cols-[14rem_minmax(0,1fr)]">
    <nav aria-label="설정 항목" className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
      {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => selectSection(id)} aria-current={active === id ? 'page' : undefined} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-left text-sm font-bold ${active === id ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><Icon size={17}/>{label}</button>)}
    </nav>
    <div className="min-w-0">
      {active === 'work' && <section id="work" aria-labelledby="work-title" className="card p-5 md:p-7"><h2 id="work-title" className="text-lg font-bold">근무 설정</h2><p className="mt-1 text-sm text-slate-500">기본 주소, 근무 시간과 요일별 근무 형태를 관리합니다.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold">
            집 주소
            <span className="mt-2 flex gap-2">
              <input value={props.homeAddress} onChange={(event) => props.onHomeAddressChange(event.target.value)} className="settings-control w-full rounded-xl border border-slate-200 px-3.5 text-sm" autoComplete="street-address" placeholder="주소 검색으로 선택해 주세요"/>
              <button type="button" onClick={() => void openAddressSearch('home')} disabled={addressSearchLoading !== null} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 shadow-sm hover:bg-blue-100 disabled:opacity-50"><Search size={14}/>{addressSearchLoading === 'home' ? '검색 중' : '검색'}</button>
            </span>
          </label>
          <label className="text-xs font-bold">
            회사 주소
            <span className="mt-2 flex gap-2">
              <input value={props.workAddress} onChange={(event) => props.onWorkAddressChange(event.target.value)} className="settings-control w-full rounded-xl border border-slate-200 px-3.5 text-sm" autoComplete="street-address" placeholder="주소 검색으로 선택해 주세요"/>
              <button type="button" onClick={() => void openAddressSearch('work')} disabled={addressSearchLoading !== null} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 shadow-sm hover:bg-blue-100 disabled:opacity-50"><Search size={14}/>{addressSearchLoading === 'work' ? '검색 중' : '검색'}</button>
            </span>
          </label>
          <label className="text-xs font-bold">출근 시각<input type="time" value={props.schedule.startTime} onChange={(event) => props.onScheduleChange({ ...props.schedule, startTime: event.target.value })} className="settings-control mt-2 w-full rounded-xl border border-slate-200 px-3"/></label>
          <label className="text-xs font-bold">퇴근 시각<input type="time" value={props.schedule.endTime} onChange={(event) => props.onScheduleChange({ ...props.schedule, endTime: event.target.value })} className="settings-control mt-2 w-full rounded-xl border border-slate-200 px-3"/></label>
        </div>
        <div className="mt-5 space-y-2">{weekdays.map(({ day, label }) => { const mode = getWorkdaySchedule(props.schedule, new Date(2024, 0, day)).mode; const displayMode: WorkdayMode = mode === 'remote' ? 'office' : mode; return <div key={day} className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm font-bold">{label}요일 <span className="font-normal text-slate-400">({weekdayDateLabel(day, monday)})</span></span><div className="grid grid-cols-2 gap-1" role="group" aria-label={`${label}요일 근무 형태`}>{(['office', 'off'] as WorkdayMode[]).map((item) => <button key={item} type="button" aria-pressed={displayMode === item} onClick={() => setMode(day, item)} className={`min-h-10 rounded-lg px-3 text-xs font-bold ${mode === item ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}>{modeLabel[item]}</button>)}</div></div>; })}</div>
        <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">재택은 여기서 정하지 않습니다. 아래 <strong>재택근무 신청</strong>에서 신청하고 <strong>승인받은 날만</strong> 재택으로 기록됩니다.</p>
        <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={props.onSave} disabled={props.saving} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white disabled:opacity-60">{props.saving ? '저장 중…' : '근무 설정 저장'}</button><p role="status" aria-live="polite" className="text-xs text-slate-600">{props.status}</p></div>
      </section>}

      {/* 재택은 오직 이 신청·승인으로만 정해집니다. 요일별 설정에서 뺀 이유가 이것입니다 —
          기기 설정으로 재택을 주장할 수 있으면 위치 인증(지오펜스)이 그냥 우회됩니다. */}
      {active === 'work' && <RemoteWorkPanel />}

      {active === 'work' && <LeavePanel />}

      {active === 'route' && <section id="route" aria-labelledby="route-title" className="card p-5 md:p-7"><h2 id="route-title" className="text-lg font-bold">경로 설정</h2><p className="mt-1 text-sm text-slate-500">추천 우선순위와 선택 기록 학습 여부를 정합니다.</p><fieldset className="mt-6"><legend className="text-sm font-bold">경로 선호</legend><div className="mt-3 grid gap-2 sm:grid-cols-3">{([['fastest','빠른 경로'],['least-walking','적은 도보'],['fewest-transfers','적은 환승']] as const).map(([value, label]) => <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${preference === value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200'}`}><input type="radio" name="route-preference" checked={preference === value} onChange={() => { setPreference(value); saveRoutePreference(value); setLocalStatus('경로 선호를 저장했습니다.'); }}/>{label}</label>)}</div></fieldset>
        <label className="mt-6 flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-4"><span><span className="block text-sm font-bold">선택 경로 학습</span><span className="mt-1 block text-xs leading-5 text-slate-500">최근 선택을 이 기기에 저장해 다음 추천에 반영합니다.</span></span><input type="checkbox" checked={learning} onChange={(event) => { setLearning(event.target.checked); setRouteLearningEnabled(event.target.checked); }} className="mt-1 size-5"/></label><div className="mt-5"><ConfirmAction label="학습 기록 초기화" confirmLabel="기록 초기화" onConfirm={() => { clearRouteLearning(); setLocalStatus('경로 학습 기록을 초기화했습니다.'); }}/></div>
      </section>}

      {active === 'appearance' && <section id="appearance" aria-labelledby="appearance-title" className="card p-5 md:p-7"><h2 id="appearance-title" className="text-lg font-bold">화면 테마</h2><p className="mt-1 text-sm text-slate-500">앱 전체의 배경, 패널과 내비게이션 색상을 선택합니다.</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{([
        ['white', '화이트', '밝고 선명한 기본 화면', '#ffffff', '#611f69'],
        ['dark', '다크', '눈부심을 줄인 검정 화면', '#1a1d21', '#0b0d0f'],
        ['plum', '플럼', '보라색 중심의 메신저 화면', '#351237', '#3f0e40'],
      ] as const).map(([value, label, description, surface, nav]) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => { setTheme(value); saveTheme(value); setLocalStatus(`${label} 테마를 적용했습니다.`); }} className={`border p-3 text-left ${theme === value ? 'border-[var(--brand)] ring-2 ring-[var(--brand)]/20' : 'border-[var(--border)]'}`}><span className="flex h-16 overflow-hidden border border-black/10" aria-hidden="true"><span className="w-1/4" style={{ background: nav }}/><span className="flex-1" style={{ background: surface }}><span className="mt-3 ml-3 block h-2 w-2/3 bg-slate-400/40"/><span className="mt-2 ml-3 block h-5 w-4/5 bg-white/70"/></span></span><strong className="mt-3 block text-sm">{label}</strong><span className="mt-1 block text-xs text-slate-500">{description}</span></button>)}</div></section>}

      {active === 'notifications' && <section id="notifications" aria-labelledby="notifications-title" className="card p-5 md:p-7"><h2 id="notifications-title" className="text-lg font-bold">알림 설정</h2><p className="mb-6 mt-1 text-sm text-slate-500">출발 알림과 브라우저 권한을 관리합니다.</p><NotificationSettingsSlot>{props.notificationPanel}</NotificationSettingsSlot><div className="mt-5 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-sm font-extrabold text-blue-950">홈 화면에 설치</p><p className="mt-1 text-xs leading-5 text-blue-800">기기별 설치 방법과 현재 설치 가능 상태를 별도 페이지에서 확인할 수 있습니다.</p></div><Link href="/install" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm shadow-blue-200 hover:bg-blue-700">설치 방법 보기</Link></div></div></section>}

      {active === 'pet' && <section id="pet" aria-labelledby="pet-title" className="card p-5 md:p-7"><h2 id="pet-title" className="text-lg font-bold">펫 설정</h2><p className="mt-1 text-sm text-slate-500">함께할 펫과 대사 빈도를 선택합니다.</p><fieldset className="mt-6"><legend className="text-sm font-bold">펫 선택</legend><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{PET_IDS.map((id) => <button key={id} type="button" aria-pressed={petId === id} onClick={() => { setPetId(id); storePetId(id); }} className={`min-h-12 rounded-xl border px-3 text-sm font-bold ${petId === id ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200'}`} style={petId === id ? { borderColor: PET_CATALOG[id].color } : undefined}>{petLabel[id]}</button>)}</div></fieldset><label className="mt-6 block text-sm font-bold" htmlFor="pet-frequency">대사 빈도</label><select id="pet-frequency" value={localSettings.petMessageFrequency} onChange={(event) => updateLocalSettings({ ...localSettings, petMessageFrequency: event.target.value as LocalSettings['petMessageFrequency'] })} className="settings-control mt-2 w-full rounded-xl border border-slate-200 px-3 text-sm sm:max-w-xs"><option value="frequent">자주 · 기록 코칭 강화</option><option value="normal">보통</option><option value="quiet">조용히</option></select><p className="mt-2 text-xs text-slate-500">‘자주’는 약 30초 간격으로 AI가 출퇴근 기록을 보고 칭찬과 잔소리를 더 자주 들려줍니다.</p></section>}

      {active === 'ai-privacy' && <section id="ai-privacy" aria-labelledby="ai-title" className="card p-5 md:p-7"><h2 id="ai-title" className="text-lg font-bold">AI·개인정보</h2><div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-950"><p className="font-bold">AI 답변의 근거</p><p>답변에는 사용한 통근 기록, 실시간 정보 여부, 추정값과 주의사항을 구분해 표시합니다. 피드백 집계는 이 브라우저에만 저장됩니다.</p></div><div className="mt-5"><ConfirmAction label="AI 근거·피드백 로컬 데이터 초기화" confirmLabel="AI 데이터 초기화" onConfirm={() => { clearAiLocalData(); setLocalStatus('이 기기의 AI 피드백 데이터를 초기화했습니다.'); }}/></div><div className="mt-8 border-t border-slate-200 pt-6"><h3 className="font-bold text-red-700">모든 로컬 설정 초기화</h3><p className="mt-1 text-xs leading-5 text-slate-500">근무 일정, 경로 선호·학습, 펫, AI 피드백과 화면 설정을 이 기기에서 지웁니다. 서버의 주소·통근 기록·계정은 유지됩니다.</p><div className="mt-4"><ConfirmAction tone="danger" label="모든 로컬 설정 초기화" confirmLabel="모두 초기화" onConfirm={resetAll}/></div></div></section>}

      {active === 'account' && <section id="account" aria-labelledby="account-title" className="card p-5 md:p-7"><h2 id="account-title" className="text-lg font-bold">계정</h2><div className="mt-5"><LogoutButton /></div><div className="mt-5"><DeleteAccountPanel userId={props.userId}/></div></section>}
      {localStatus && <p className="mt-4 text-xs text-emerald-700" role="status" aria-live="polite">{localStatus}</p>}
    </div>
  </div>;
}
