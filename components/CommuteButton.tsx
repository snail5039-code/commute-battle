'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, Palmtree, Check, MapPin, TrainFront, House, PartyPopper, LoaderCircle, ShieldAlert, X, CalendarDays, Thermometer } from 'lucide-react';
import { User, CommuteRecord, RouteGuideResponse } from '@/lib/types';
import { generateRouteGuide } from '@/lib/gemini';
import { recordArrival, recordInstantTrip } from '@/lib/commuteArrival';
import { recordAttendanceEvent } from '@/lib/attendance';
import { formatDistance, locationNotice, type LocationNotice } from '@/lib/geofence';
import { isRemoteApprovedToday } from '@/lib/remoteWork';
import { fetchHolidayOn, type WorkHoliday } from '@/lib/holidays';
import RouteModal from './RouteModal';
import WeatherCard from './WeatherCard';
import DepartureRecommendation from './DepartureRecommendation';
import EvolutionCelebration from './EvolutionCelebration';
import { geocodeAddress, loadKakaoMapSdk } from '@/lib/kakaoMap';
import { fetchWeather, recommendDeparture, WEATHER_FALLBACK, WeatherResponse } from '@/lib/weather';
import { getWorkdaySchedule, loadWorkSchedule, useStore } from '@/lib/store';
import { useSelectedPetId } from '@/lib/petCatalog';
import type { LevelProgress } from '@/lib/characterStages';
import { localDateKey } from '@/lib/date';
import { fetchChatWorkspaces } from '@/lib/departmentChat';
import { locationShareKey, stopCommuteLocation, updateCommuteLocation } from '@/lib/workspaceAdmin';

interface CommuteButtonProps {
  user: User;
  records: CommuteRecord[];
  onChange: () => void;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatMinutesOfDay(value: number) {
  const normalized = (value + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}시간 ${minutes}분 ${seconds}초` : `${minutes}분 ${seconds}초`;
}

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
  const [weather, setWeather] = useState<WeatherResponse>(WEATHER_FALLBACK);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [celebration, setCelebration] = useState<LevelProgress | null>(null);
  // 위치 인증에 실패한 채로 기록됐을 때만 뜹니다. 기록은 이미 저장돼 있고, 안내만 하는 배너입니다.
  const [unverified, setUnverified] = useState<LocationNotice | null>(null);
  const [locationSharing, setLocationSharing] = useState(false);
  const [locationError, setLocationError] = useState('');
  const lastLocationSentAt = useRef(0);
  // null = 아직 확인 중. 확인이 끝나기 전에는 기기 설정을 그대로 보여 줍니다.
  const [remoteApproved, setRemoteApproved] = useState<boolean | null>(null);
  // 공휴일이어도 출근을 막지 않습니다. 휴일 근무는 실제로 있고, 집계에서 휴일근로로 잡히면 될 일입니다.
  const [holiday, setHoliday] = useState<WorkHoliday | null>(null);
  const storedSchedule = useStore((state) => state.workSchedule);
  const setStoredSchedule = useStore((state) => state.setWorkSchedule);
  const petId = useSelectedPetId();

  const today = localDateKey(now);
  const yesterday = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  // 자정을 넘겨 일하면 오늘 날짜에는 출근 기록이 없습니다. 날짜만 보고 버튼 상태를 정하면
  // 새벽 1시에 퇴근 버튼이 비활성화돼 퇴근을 아예 못 찍습니다. 그래서 서버의
  // attendance_work_date와 같은 규칙으로 '아직 퇴근으로 닫히지 않은 근무일'을 기준으로 삼습니다.
  const countOn = (date: string, type: CommuteRecord['type']) =>
    records.filter((r) => r.date === date && r.type === type).length;
  const activeWorkDate =
    [today, yesterday].find((date) => countOn(date, 'commute') > countOn(date, 'return')) ?? today;

  const activeRecord = records
    .filter((r) => (r.date === today || r.date === yesterday) && (r.type === 'commute' || r.type === 'return') && !r.end_time)
    .sort((a, b) => (b.start_time ?? '').localeCompare(a.start_time ?? ''))[0];
  const commuteCount = countOn(activeWorkDate, 'commute');
  const returnCount = countOn(activeWorkDate, 'return');
  // 조퇴·병가·휴가는 서버가 항상 오늘 날짜로 기록하므로 여기서도 오늘 기준으로 셉니다.
  const earlyLeaveCount = countOn(today, 'early_leave');
  const vacationCount = countOn(today, 'vacation');
  const sickCount = countOn(today, 'sick');

  useEffect(() => {
    const saved = loadWorkSchedule(user.id);
    setStoredSchedule(saved);
  }, [user.id, setStoredSchedule]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      let coordinates: { lat: number; lng: number } | null = null;
      let locationSource: WeatherResponse['locationSource'] = 'default';
      try {
        coordinates = await new Promise((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => resolve(null),
            { timeout: 4_000, maximumAge: 10 * 60 * 1000 }
          );
        });
        if (coordinates) locationSource = 'current';
        if (!coordinates && user.home_address) {
          const sdk = await loadKakaoMapSdk();
          coordinates = await geocodeAddress(sdk, user.home_address);
          if (coordinates) locationSource = 'saved-address';
        }
        if (!coordinates) coordinates = { lat: 37.5665, lng: 126.978 };
        const result = await fetchWeather(coordinates.lat, coordinates.lng, controller.signal);
        setWeather({ ...result, locationSource });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Weather loading failed:', error);
          setWeather({ ...WEATHER_FALLBACK, locationSource });
        }
      } finally {
        if (!controller.signal.aborted) setWeatherLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [user.home_address]);

  useEffect(() => {
    if (activeRecord?.type !== 'commute' || localStorage.getItem(locationShareKey(user.id)) !== 'true') return;
    let watchId: number | null = null;
    let active = true;
    const timer = window.setTimeout(() => {
      setLocationSharing(true); setLocationError('');
      void fetchChatWorkspaces().then((workspaces) => {
        if (!active || !navigator.geolocation) throw new Error('이 기기에서 위치 기능을 사용할 수 없습니다.');
        watchId = navigator.geolocation.watchPosition((position) => {
          if (Date.now() - lastLocationSentAt.current < 30_000) return;
          lastLocationSentAt.current = Date.now();
          void Promise.all(workspaces.map((workspace) => updateCommuteLocation(workspace.id, position))).catch(() => setLocationError('위치 갱신에 실패했습니다.'));
        }, () => setLocationError('정확한 위치 권한이 필요합니다.'), { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 });
      }).catch((cause) => setLocationError(cause instanceof Error ? cause.message : '위치 공유를 시작하지 못했습니다.'));
    }, 0);
    return () => { active = false; window.clearTimeout(timer); if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, [activeRecord?.id, activeRecord?.type, user.id]);

  const storedWorkday = getWorkdaySchedule(storedSchedule, now);
  // 재택은 승인된 날에만 가능하므로, 승인이 있으면 기기 설정과 무관하게 재택으로 다룹니다.
  // 반대로 설정만 재택이고 승인이 없으면 사무실 출퇴근으로 되돌립니다(서버에서도 막힙니다).
  const workday = remoteApproved === null || storedWorkday.mode === 'off'
    ? storedWorkday
    : { ...storedWorkday, mode: remoteApproved ? 'remote' : storedWorkday.mode === 'remote' ? 'office' : storedWorkday.mode } as const;
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void isRemoteApprovedToday().then((approved) => { if (active) setRemoteApproved(approved); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [today, records.length]);

  // 공휴일은 서버(work_holidays)에만 있습니다. 버튼을 막지는 않고 안내만 합니다 —
  // 휴일 출근은 실제로 있고, 집계가 알아서 휴일근로로 잡습니다.
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void fetchHolidayOn(activeWorkDate).then((found) => { if (active) setHoliday(found); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [activeWorkDate]);

  const workStartMin = timeToMinutes(workday.startTime);
  const workEndMin = timeToMinutes(workday.endTime);
  const baseRecommendation = recommendDeparture(records, weather, now);
  const departureRecommendation = {
    ...baseRecommendation,
    departureTime: formatMinutesOfDay(timeToMinutes(baseRecommendation.departureTime) + workStartMin - 9 * 60),
    reasons: [
      ...baseRecommendation.reasons.filter((reason) => !reason.includes('09:00 도착')),
      `${workday.startTime} 도착 기준`,
    ],
  };

  const requestRoute = async (type: 'commute' | 'return') => {
    setLoadingAction(type);
    try {
      const guide = await generateRouteGuide({
        home_address: user.home_address || '집',
        work_address: user.work_address || '회사',
        commute_type: type,
        weather: {
          precipitation_mm_h: weather.current.precipitation,
          probability: weather.current.precipitationProbability,
          condition: weather.current.weatherCode === 0 ? '맑음' : '기상 변화 있음',
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

  // 재택근무일엔 이동이 없으므로 경로 안내 없이 바로 완료 처리한다 (집 컴퓨터 앞에 앉는 순간이 출근/퇴근)
  const recordRemoteEvent = async (type: 'commute' | 'return') => {
    setLoadingAction(type);
    try {
      const progress = await recordInstantTrip(user, type);
      setUnverified(null);  // 재택은 승인제로 통제하므로 위치 인증 대상이 아닙니다.
      onChange();
      if (progress.levelsGained > 0) setCelebration(progress);
    } catch (error) {
      console.error('Error recording remote work event:', error);
      alert('기록에 실패했습니다');
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePrimaryAction = (type: 'commute' | 'return') => {
    if (workday.mode === 'off') return;
    if (workday.mode === 'remote') { void recordRemoteEvent(type); return; }
    void requestRoute(type);
  };

  const recordSimpleEvent = async (
    type: 'early_leave' | 'sick' | 'absence'
  ) => {
    setLoadingAction(type);
    try {
      await recordAttendanceEvent(type);
      onChange();
    } catch (error) {
      console.error('Error recording event:', error);
      alert(error instanceof Error ? error.message : '기록에 실패했습니다');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleArrival = async () => {
    if (!activeRecord) return;
    setLoadingAction('arrive');

    try {
      const { progress, record } = await recordArrival(user, records, activeRecord);
      setUnverified(locationNotice(record));
      await stopCommuteLocation();
      localStorage.setItem(locationShareKey(user.id), 'false');
      setLocationSharing(false);
      onChange();
      if (progress.levelsGained > 0) setCelebration(progress);
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
      ((nowMin - workStartMin) / Math.max(1, workEndMin - workStartMin)) * 100,
      0
    ),
    100
  );

  const elapsedMs = activeRecord
    ? now.getTime() - new Date(activeRecord.start_time!).getTime()
    : 0;
  const endOfWork = new Date(now);
  endOfWork.setHours(Math.floor(workEndMin / 60), workEndMin % 60, 0, 0);
  const isWorking = !activeRecord && commuteCount > returnCount && workday.mode !== 'off';
  const workRemainingMs = endOfWork.getTime() - now.getTime();

  const activeOrdinal = activeRecord
    ? countOn(activeRecord.date, activeRecord.type)
    : 0;

  const statusText = workday.mode === 'off'
    ? '오늘은 휴무입니다'
    : activeRecord
      ? activeRecord.type === 'commute'
        ? `${activeOrdinal >= 2 ? `오늘 ${activeOrdinal}번째 ` : ''}출근 중입니다`
        : `${activeOrdinal >= 2 ? `오늘 ${activeOrdinal}번째 ` : ''}퇴근 중입니다`
      : commuteCount > 0 && returnCount === 0
        ? workday.mode === 'remote' ? '재택근무 중입니다' : '근무 중입니다'
        : commuteCount > 0 && returnCount > 0
          ? '오늘 근무를 마쳤습니다'
          : workday.mode === 'remote' ? '재택근무 시작 전입니다' : '출근 전입니다';

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

        {workday.mode === 'off' && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center text-[13px] font-bold text-slate-500">
            오늘은 휴무입니다!
          </div>
        )}

        {holiday && workday.mode !== 'off' && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-rose-900">
            <CalendarDays size={16} className="mt-0.5 shrink-0" />
            <p className="min-w-0 flex-1 text-[12px] leading-5">
              <strong className="block text-[13px]">
                {activeWorkDate === today ? '오늘은' : `${activeWorkDate}은(는)`} {holiday.name}입니다
              </strong>
              쉬는 날이지만 기록은 그대로 남길 수 있어요. 근무하면 <strong>휴일근로</strong>로 집계되고 지각은 따지지 않습니다.
            </p>
          </div>
        )}

        {unverified && (
          <div role="status" className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-900">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1 text-[12px] leading-5">
              <strong className="block text-[13px]">위치 미인증으로 기록되었습니다 · {unverified.label}</strong>
              <span className="mt-0.5 block">{unverified.hint}</span>
              {unverified.distanceM !== null && (
                <span className="mt-0.5 block text-[11px] text-amber-700">사업장에서 약 {formatDistance(unverified.distanceM)} 떨어진 곳에서 기록됨</span>
              )}
            </div>
            <button type="button" onClick={() => setUnverified(null)} aria-label="안내 닫기" className="shrink-0 rounded-md p-0.5 hover:bg-amber-100"><X size={14} /></button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => handlePrimaryAction('commute')}
            disabled={!!loadingAction || !!activeRecord || commuteCount > returnCount || workday.mode === 'off'}
            title={workday.mode === 'off' ? '오늘은 휴무일이라 출근을 기록할 수 없어요' : undefined}
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
            {loadingAction === 'commute' ? '조회 중...' : workday.mode === 'remote' ? '재택 출근' : '출근하기'}
          </button>

          <button
            onClick={() => handlePrimaryAction('return')}
            disabled={!!loadingAction || !!activeRecord || commuteCount <= returnCount || workday.mode === 'off'}
            title={workday.mode === 'off' ? '오늘은 휴무일이라 퇴근을 기록할 수 없어요' : undefined}
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
            {loadingAction === 'return' ? '조회 중...' : workday.mode === 'remote' ? '재택 퇴근' : '퇴근하기'}
          </button>
        </div>

        <WeatherCard weather={weather} loading={weatherLoading} />
        <DepartureRecommendation recommendation={departureRecommendation} />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-neutral-400">출근 {workday.startTime}</span>
            <span className="text-center text-[10px] text-neutral-500">
              <span className="block">{activeRecord ? '이동 경과' : isWorking ? '퇴근까지' : '현재 시각'}</span>
              <span className="font-mono text-[13px] font-semibold text-neutral-800 tabular-nums">
              {activeRecord ? formatElapsed(elapsedMs) : isWorking ? (workRemainingMs > 0 ? formatRemaining(workRemainingMs) : '퇴근 권장') : formatClock(now)}
              </span>
            </span>
            <span className="text-[10px] text-neutral-400">퇴근 {workday.endTime}</span>
          </div>
          <div className="relative w-full bg-neutral-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-neutral-500 mt-2 text-center">
            {isWorking && workRemainingMs > 0 ? `퇴근까지 ${formatRemaining(workRemainingMs)}` : isWorking ? '설정한 퇴근 시간이 지났어요. 퇴근을 권장합니다.' : statusText}
          </p>
        </div>

        {activeRecord && (
          <div className="space-y-2.5">
          {activeRecord.type === 'commute' && locationSharing && <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><span className="flex items-center gap-2"><span className="size-2 animate-pulse rounded-full bg-emerald-500"/>정확한 위치 공유 중{locationError && ` · ${locationError}`}</span><button type="button" onClick={() => { void stopCommuteLocation(); localStorage.setItem(locationShareKey(user.id), 'false'); setLocationSharing(false); }} className="font-bold underline">중단</button></div>}
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
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            onClick={() => recordSimpleEvent('early_leave')}
            disabled={!!loadingAction || commuteCount === 0 || earlyLeaveCount > 0 || workday.mode === 'off'}
            title={workday.mode === 'off' ? '오늘은 휴무일이에요' : commuteCount === 0 ? '출근 후에 조퇴를 기록할 수 있어요' : earlyLeaveCount > 0 ? '조퇴는 하루에 한 번만 기록할 수 있어요' : undefined}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-1 py-2.5 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 ring-1 ring-amber-100"><Clock3 size={15} strokeWidth={2.25} /></span>
            <span className="truncate">{loadingAction === 'early_leave' ? '기록 중...' : earlyLeaveCount > 0 ? '조퇴 완료' : '조퇴'}</span>
          </button>

          {/* 병가는 조퇴·휴가와 다르게 자기신고로 둡니다. 아파서 못 나오는 건 그날 아침에 벌어지는
              일이라, 승인을 기다려야 기록할 수 있으면 기록 자체가 늦어집니다. 연차를 깎지도 않습니다.
              잘못 눌렀으면 근태 정정 요청으로 바로잡습니다. */}
          <button
            onClick={() => recordSimpleEvent('sick')}
            disabled={!!loadingAction || sickCount > 0 || returnCount > 0 || workday.mode === 'off'}
            title={workday.mode === 'off' ? '오늘은 휴무일이에요' : returnCount > 0 ? '퇴근한 뒤에는 병가를 기록할 수 없어요' : sickCount > 0 ? '병가는 하루에 한 번만 기록할 수 있어요' : undefined}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-1 py-2.5 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-rose-700 ring-1 ring-rose-100"><Thermometer size={15} strokeWidth={2.25} /></span>
            <span className="truncate">{loadingAction === 'sick' ? '기록 중...' : sickCount > 0 ? '병가 중' : '병가'}</span>
          </button>

          {/* 휴가는 신청 → 승인으로만 잡히고, 승인되면 서버가 그 기간의 근무일에 기록을 만듭니다.
              여기서 직접 만들 수 있게 두면 승인 없는 휴가가 다시 생깁니다. 신청 화면으로 보냅니다. */}
          <button
            onClick={() => router.push('/settings#leave')}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-1 py-2.5 text-[11px] font-bold text-teal-700 transition-colors hover:bg-teal-100"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700 ring-1 ring-teal-100"><Palmtree size={15} strokeWidth={2.25} /></span>
            <span className="truncate">{vacationCount > 0 ? '휴가 중' : '휴가 신청'}</span>
          </button>
        </div>
      </div>

      {showRoute && routeGuide && (
        <RouteModal
          guide={routeGuide}
          user={user}
          type={routeType}
          recommendation={departureRecommendation}
          onClose={() => setShowRoute(false)}
          onDeparted={async () => {
            setShowRoute(false);
            await onChange();
            router.push('/map');
          }}
        />
      )}

      {celebration && (
        <EvolutionCelebration
          level={celebration.level}
          stage={celebration.stage}
          evolved={celebration.evolved}
          petId={petId}
          onClose={() => setCelebration(null)}
        />
      )}
    </>
  );
}
