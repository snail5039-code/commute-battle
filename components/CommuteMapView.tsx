'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bus, Crosshair, Footprints, MapPin, Navigation, TrainFront, X } from 'lucide-react';
import { CommuteRecord, User } from '@/lib/types';
import { haversineDistance, LatLng } from '@/lib/geo';
import { geocodeAddress, loadKakaoMapSdk } from '@/lib/kakaoMap';

interface CommuteMapViewProps { user: User; activeRecord: CommuteRecord; onArrive: () => Promise<void>; onClose: () => void }
type TravelMode = 'walk' | 'transit';
type LocationStatus = 'locating' | 'tracking' | 'fallback' | 'unavailable';
interface RouteSegment { trafficType: number; label: string; distance: number; sectionTime: number; points: LatLng[] }
interface RouteResponse {
  summary: { totalTime: number; totalDistance: number; totalWalk: number; payment: number; firstStartStation: string | null; lastEndStation: string | null };
  segments: RouteSegment[];
  polyline: LatLng[];
}

const SEOUL = { lat: 37.5665, lng: 126.978 };
const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 };
const ROUTE_REFRESH_DISTANCE_M = 100;
const ROUTE_REFRESH_INTERVAL_MS = 30000;
const SEGMENT_COLORS: Record<number, string> = { 1: '#10b981', 2: '#2563eb', 3: '#64748b' };

function formatElapsed(start?: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(start ?? Date.now()).getTime()) / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)}분`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `${hours}시간${rest ? ` ${rest}분` : ''}`;
}

function formatDistance(metres: number) { return metres < 1000 ? `${Math.round(metres)}m` : `${(metres / 1000).toFixed(1)}km`; }
function coordinates(position: GeolocationPosition): LatLng { return { lat: position.coords.latitude, lng: position.coords.longitude }; }

function locationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return '위치 권한이 거부되어 등록된 주소를 사용합니다.';
  if (error.code === error.TIMEOUT) return '현재 위치 확인 시간이 초과되어 등록된 주소를 사용합니다.';
  return '현재 위치를 확인할 수 없어 등록된 주소를 사용합니다.';
}

async function requestRoute(start: LatLng, end: LatLng, mode: TravelMode): Promise<RouteResponse> {
  const query = new URLSearchParams({ sx: String(start.lng), sy: String(start.lat), ex: String(end.lng), ey: String(end.lat), mode });
  const response = await fetch(`/api/route/transit?${query}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error || '경로를 불러오지 못했습니다.');
  if (!Array.isArray(data.polyline) || data.polyline.length < 2 || !Number.isFinite(data.summary?.totalTime)) throw new Error('경로 응답 형식이 올바르지 않습니다.');
  return data;
}

function dot(color: string, label: string) {
  const element = document.createElement('div');
  element.setAttribute('aria-label', label);
  element.style.cssText = `width:18px;height:18px;border:3px solid white;border-radius:50%;background:${color};box-shadow:0 2px 8px #0f172a55`;
  return element;
}

export default function CommuteMapView({ user, activeRecord, onArrive, onClose }: CommuteMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<Array<{ setMap(map: kakao.maps.Map | null): void }>>([]);
  const currentOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const watchRef = useRef<number | null>(null);
  const currentLocationRef = useRef<LatLng | null>(null);
  const startRef = useRef<LatLng | null>(null);
  const endRef = useRef<LatLng | null>(null);
  const lastRouteOriginRef = useRef<LatLng | null>(null);
  const lastRouteAtRef = useRef(0);
  const requestIdRef = useRef(0);
  const [mode, setMode] = useState<TravelMode>('transit');
  const [routeVersion, setRouteVersion] = useState(0);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [hasCurrentLocation, setHasCurrentLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('locating');
  const [locationNotice, setLocationNotice] = useState('현재 위치를 확인하고 있습니다.');
  const [error, setError] = useState<string | null>(null);
  const [arriving, setArriving] = useState(false);
  const [, tick] = useState(0);

  const showCurrentPosition = useCallback((point: LatLng, recenter = false) => {
    currentLocationRef.current = point;
    const map = mapRef.current;
    if (!map) return;
    const position = new window.kakao.maps.LatLng(point.lat, point.lng);
    if (!currentOverlayRef.current) {
      currentOverlayRef.current = new window.kakao.maps.CustomOverlay({ position, content: dot('#2563eb', '현재 위치'), zIndex: 20 });
      currentOverlayRef.current.setMap(map);
    } else currentOverlayRef.current.setPosition(position);
    if (recenter) map.panTo(position);
  }, []);

  const clearRoute = useCallback(() => { overlaysRef.current.forEach((object) => object.setMap(null)); overlaysRef.current = []; }, []);

  const drawRoute = useCallback((data: RouteResponse, selectedMode: TravelMode) => {
    const map = mapRef.current;
    const start = startRef.current;
    const end = endRef.current;
    if (!map || !start || !end) return;
    clearRoute();
    const bounds = new window.kakao.maps.LatLngBounds();
    [start, end].forEach((point) => bounds.extend(new window.kakao.maps.LatLng(point.lat, point.lng)));
    const drawableSegments = data.segments.filter((segment) => segment.points.length >= 2);
    const segments = drawableSegments.length ? drawableSegments : [{ trafficType: 3, label: '경로', distance: data.summary.totalDistance, sectionTime: data.summary.totalTime, points: data.polyline }];
    segments.forEach((segment) => {
      const path = segment.points.map((point) => { const value = new window.kakao.maps.LatLng(point.lat, point.lng); bounds.extend(value); return value; });
      const color = selectedMode === 'walk' ? '#334155' : (SEGMENT_COLORS[segment.trafficType] ?? '#64748b');
      const line = new window.kakao.maps.Polyline({ path, strokeWeight: segment.trafficType === 3 ? 4 : 7, strokeColor: color, strokeOpacity: 0.9, strokeStyle: segment.trafficType === 3 ? 'shortdash' : 'solid' });
      line.setMap(map); overlaysRef.current.push(line);
    });
    const startMarker = new window.kakao.maps.CustomOverlay({ position: new window.kakao.maps.LatLng(start.lat, start.lng), content: dot('#0f172a', '출발지'), zIndex: 18 });
    const endMarker = new window.kakao.maps.CustomOverlay({ position: new window.kakao.maps.LatLng(end.lat, end.lng), content: dot('#ef4444', '도착지'), zIndex: 18 });
    startMarker.setMap(map); endMarker.setMap(map); overlaysRef.current.push(startMarker, endMarker);
    map.setBounds(bounds);
  }, [clearRoute]);

  useEffect(() => {
    let cancelled = false;
    let initialPositionSettled = false;
    const initialPosition = navigator.geolocation
      ? new Promise<{ position: GeolocationPosition; error?: never } | { position?: never; error: GeolocationPositionError }>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve({ position }),
            (error) => resolve({ error }),
            GEO_OPTIONS,
          );
        })
      : null;

    const acceptLivePosition = (position: GeolocationPosition, initial: boolean) => {
      if (cancelled) return;
      const point = coordinates(position);
      showCurrentPosition(point, initial);
      setHasCurrentLocation(true);
      setLocationStatus('tracking');
      setLocationNotice(`현재 위치 사용 중 · 정확도 약 ${Math.round(position.coords.accuracy)}m`);
      const previousOrigin = lastRouteOriginRef.current;
      const shouldRefresh = !previousOrigin || (
        Date.now() - lastRouteAtRef.current >= ROUTE_REFRESH_INTERVAL_MS &&
        haversineDistance(previousOrigin, point) >= ROUTE_REFRESH_DISTANCE_M
      );
      if (initial || shouldRefresh) {
        startRef.current = point;
        setRouteVersion((value) => value + 1);
      }
    };

    loadKakaoMapSdk().then(async (sdk) => {
      if (cancelled || !containerRef.current) return;
      mapRef.current = new sdk.maps.Map(containerRef.current, { center: new sdk.maps.LatLng(SEOUL.lat, SEOUL.lng), level: 5 });
      const [home, work] = await Promise.all([
        user.home_address ? geocodeAddress(sdk, user.home_address) : null,
        user.work_address ? geocodeAddress(sdk, user.work_address) : null,
      ]);
      if (cancelled) return;
      const addressStart = activeRecord.type === 'commute' ? home : work;
      endRef.current = activeRecord.type === 'commute' ? work : home;

      const applyFallback = (notice: string) => {
        if (cancelled || initialPositionSettled) return;
        initialPositionSettled = true;
        startRef.current = addressStart;
        setLocationStatus(addressStart ? 'fallback' : 'unavailable');
        setLocationNotice(notice);
        setMapReady(true);
        setLoading(false);
        setRouteVersion((value) => value + 1);
      };

      if (!initialPosition) {
        applyFallback('이 브라우저는 위치 정보를 지원하지 않아 등록된 주소를 사용합니다.');
      } else {
        const result = await initialPosition;
        if (cancelled) return;
        if (result.position) {
          initialPositionSettled = true;
          acceptLivePosition(result.position, true);
          setMapReady(true);
          setLoading(false);
          watchRef.current = navigator.geolocation.watchPosition(
            (update) => acceptLivePosition(update, false),
            (watchError) => setLocationNotice(locationErrorMessage(watchError)),
            GEO_OPTIONS,
          );
        } else {
          applyFallback(locationErrorMessage(result.error));
        }
      }

      if (!endRef.current) setError('도착지 위치를 확인할 수 없습니다. 등록된 주소를 확인해 주세요.');
    }).catch(() => { if (!cancelled) { setError('지도를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); setLoading(false); setLocationStatus('unavailable'); } });
    return () => {
      cancelled = true;
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      requestIdRef.current += 1;
      clearRoute();
      currentOverlayRef.current?.setMap(null);
      currentOverlayRef.current = null;
      mapRef.current = null;
    };
  }, [activeRecord.type, clearRoute, showCurrentPosition, user.home_address, user.work_address]);

  useEffect(() => {
    if (!mapReady || !startRef.current || !endRef.current) return;
    const start = startRef.current;
    const end = endRef.current;
    const requestId = ++requestIdRef.current;
    lastRouteOriginRef.current = start;
    lastRouteAtRef.current = Date.now();
    setLoading(true); setError(null); setRoute(null); clearRoute();
    requestRoute(start, end, mode).then((data) => {
      if (requestId !== requestIdRef.current) return;
      setRoute(data); drawRoute(data, mode);
    }).catch((reason) => { if (requestId === requestIdRef.current) setError(reason instanceof Error ? reason.message : '경로를 불러오지 못했습니다.'); })
      .finally(() => { if (requestId === requestIdRef.current) setLoading(false); });
  }, [clearRoute, drawRoute, mapReady, mode, routeVersion]);

  useEffect(() => { const timer = setInterval(() => tick((value) => value + 1), 1000); return () => clearInterval(timer); }, []);
  const arrive = async () => { setArriving(true); try { await onArrive(); } finally { setArriving(false); } };
  const recenter = () => { if (currentLocationRef.current) showCurrentPosition(currentLocationRef.current, true); };

  const panel = (
    <aside className="flex max-h-[46vh] flex-col bg-white p-4 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] md:h-full md:max-h-none md:w-[360px] md:shrink-0 md:border-l md:border-neutral-200 md:shadow-none">
      <div className="mb-3 flex w-fit rounded-full bg-neutral-100 p-1">
        {(['walk', 'transit'] as const).map((value) => <button key={value} onClick={() => setMode(value)} aria-pressed={mode === value} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ${mode === value ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500'}`}>{value === 'walk' ? <Footprints size={13} /> : <Bus size={13} />}{value === 'walk' ? '도보' : '대중교통'}</button>)}
      </div>
      {locationStatus === 'locating' && <div className="mb-3 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-700"><Navigation className="animate-pulse" size={16} />{locationNotice}</div>}
      {locationStatus !== 'locating' && <p className="mb-3 text-xs text-neutral-500">{locationNotice}</p>}
      {loading && locationStatus !== 'locating' && <div className="flex items-center gap-2 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500"><Navigation className="animate-pulse" size={16} />경로를 찾고 있어요</div>}
      {error && <div className="space-y-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"><div className="flex gap-2"><AlertCircle className="mt-0.5 shrink-0" size={16} /><span>{error}</span></div><button onClick={() => setMode(mode === 'walk' ? 'transit' : 'walk')} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm">{mode === 'walk' ? '대중교통 경로 보기' : '도보 경로 보기'}</button></div>}
      {route && !loading && <div className="min-h-0 flex-1 overflow-y-auto"><div className="flex items-end justify-between border-b border-neutral-100 pb-4"><div><p className="text-xs text-neutral-500">예상 소요 시간</p><strong className="text-2xl text-neutral-900">{formatMinutes(route.summary.totalTime)}</strong></div><span className="text-sm text-neutral-500">{formatDistance(route.summary.totalDistance)}</span></div><ol className="mt-3 space-y-2">{route.segments.map((segment, index) => <li key={`${segment.label}-${index}`} className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3"><span className={`grid size-8 shrink-0 place-items-center rounded-full ${segment.trafficType === 1 ? 'bg-emerald-100 text-emerald-700' : segment.trafficType === 2 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>{segment.trafficType === 1 ? <TrainFront size={15} /> : segment.trafficType === 2 ? <Bus size={15} /> : <Footprints size={15} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-neutral-800">{segment.label}</p><p className="text-xs text-neutral-500">{formatMinutes(segment.sectionTime)} · {formatDistance(segment.distance)}</p></div></li>)}</ol>{route.summary.payment > 0 && <p className="mt-3 text-right text-xs text-neutral-500">예상 요금 {route.summary.payment.toLocaleString()}원</p>}</div>}
    </aside>
  );

  return <div className="absolute inset-0 z-10 flex flex-col bg-white"><header className="relative z-20 flex items-center justify-between border-b border-neutral-100 px-4 py-3"><div><p className="text-[13px] font-semibold text-neutral-900">{activeRecord.type === 'commute' ? '출근 이동 중' : '퇴근 이동 중'}</p><p className="text-[11px] text-neutral-400">현재 위치와 경로를 실시간으로 확인하세요</p></div><button onClick={onClose} aria-label="지도 닫기" className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"><X size={18} /></button></header><div className="flex min-h-0 flex-1 flex-col md:flex-row"><div className="relative min-h-[45vh] flex-1"><div ref={containerRef} className="absolute inset-0" /><div className="absolute left-3 top-3 z-20 rounded-lg bg-white/90 px-2 py-1 text-[10px] text-neutral-500 shadow"><MapPin className="mr-1 inline" size={11} />파랑 현재 · 검정 출발 · 빨강 도착</div><button type="button" onClick={recenter} disabled={!hasCurrentLocation} className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-lg disabled:cursor-not-allowed disabled:opacity-50"><Crosshair size={15} />내 위치로</button></div>{panel}</div><footer className="relative z-20 flex items-center gap-4 border-t border-neutral-100 bg-white p-4"><p className="flex-1 text-center font-mono text-[20px] font-semibold tabular-nums">{formatElapsed(activeRecord.start_time)}</p><button onClick={arrive} disabled={arriving} className="w-1/2 rounded-[14px] bg-emerald-500 py-3 text-[14px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">{arriving ? '기록 중…' : '도착'}</button></footer></div>;
}
