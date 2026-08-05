'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bus, Footprints, MapPin, Navigation, TrainFront, X } from 'lucide-react';
import { CommuteRecord, User } from '@/lib/types';
import { LatLng, haversineDistance } from '@/lib/geo';
import { geocodeAddress, loadKakaoMapSdk } from '@/lib/kakaoMap';

interface CommuteMapViewProps {
  user: User;
  activeRecord: CommuteRecord;
  onArrive: () => Promise<void>;
  onClose: () => void;
}

type TravelMode = 'walk' | 'transit';
interface RouteSegment { trafficType: number; label: string; distance: number; sectionTime: number; points: LatLng[] }
interface RouteResponse {
  summary: { totalTime: number; totalWalk: number; payment: number; firstStartStation: string | null; lastEndStation: string | null };
  segments: RouteSegment[];
  polyline: LatLng[];
}

const SEOUL = { lat: 37.5665, lng: 126.978 };
const SEGMENT_COLORS: Record<number, string> = { 1: '#10b981', 2: '#2563eb', 3: '#64748b' };

function formatElapsed(start?: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(start ?? Date.now()).getTime()) / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((value) => String(value).padStart(2, '0')).join(':');
}

function currentPosition(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  });
}

async function requestRoute(start: LatLng, end: LatLng, mode: TravelMode): Promise<RouteResponse> {
  const query = new URLSearchParams({ sx: `${start.lng}`, sy: `${start.lat}`, ex: `${end.lng}`, ey: `${end.lat}`, mode });
  const response = await fetch(`/api/route/transit?${query}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error || '경로를 불러오지 못했습니다.');
  if (!Array.isArray(data.polyline) || data.polyline.length < 2 || !Number.isFinite(data.summary?.totalTime)) {
    throw new Error('경로 응답 형식이 올바르지 않습니다.');
  }
  return data;
}

function markerContent() {
  const element = document.createElement('div');
  element.innerHTML = '<div style="width:18px;height:18px;border:3px solid white;border-radius:50%;background:#2563eb;box-shadow:0 2px 8px #1e3a8a66"></div>';
  return element;
}

export default function CommuteMapView({ user, activeRecord, onArrive, onClose }: CommuteMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const positionOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const watchRef = useRef<number | null>(null);
  const startRef = useRef<LatLng | null>(null);
  const endRef = useRef<LatLng | null>(null);
  const routeObjectsRef = useRef<Array<{ setMap(map: kakao.maps.Map | null): void }>>([]);
  const requestIdRef = useRef(0);
  const [mode, setMode] = useState<TravelMode>('walk');
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arriving, setArriving] = useState(false);
  const [, tick] = useState(0);

  const showPosition = useCallback((point: LatLng) => {
    const map = mapRef.current;
    if (!map) return;
    const position = new window.kakao.maps.LatLng(point.lat, point.lng);
    if (!positionOverlayRef.current) {
      positionOverlayRef.current = new window.kakao.maps.CustomOverlay({ position, content: markerContent(), zIndex: 20 });
      positionOverlayRef.current.setMap(map);
    } else positionOverlayRef.current.setPosition(position);
  }, []);

  const drawRoute = useCallback((data: RouteResponse, selectedMode: TravelMode) => {
    const map = mapRef.current;
    if (!map) return;
    routeObjectsRef.current.forEach((object) => object.setMap(null));
    routeObjectsRef.current = [];
    const bounds = new window.kakao.maps.LatLngBounds();

    data.segments.forEach((segment) => {
      const path = segment.points.map((point) => {
        const latLng = new window.kakao.maps.LatLng(point.lat, point.lng);
        bounds.extend(latLng);
        return latLng;
      });
      const color = selectedMode === 'walk' ? '#334155' : (SEGMENT_COLORS[segment.trafficType] ?? '#64748b');
      const line = new window.kakao.maps.Polyline({
        path, strokeWeight: segment.trafficType === 3 ? 4 : 7, strokeColor: color,
        strokeOpacity: 0.9, strokeStyle: segment.trafficType === 3 ? 'shortdash' : 'solid',
      });
      line.setMap(map);
      routeObjectsRef.current.push(line);

      if (selectedMode === 'transit' && segment.trafficType !== 3 && path.length) {
        const label = document.createElement('div');
        label.textContent = segment.label;
        label.style.cssText = `padding:4px 8px;border-radius:999px;background:${color};color:white;font:600 11px sans-serif;box-shadow:0 2px 6px #0003;white-space:nowrap`;
        const overlay = new window.kakao.maps.CustomOverlay({ position: path[Math.floor(path.length / 2)], content: label, yAnchor: 1.35, zIndex: 15 });
        overlay.setMap(map);
        routeObjectsRef.current.push(overlay);
      }
    });
    map.setBounds(bounds);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMapSdk().then(async (sdk) => {
      if (cancelled || !containerRef.current) return;
      const map = new sdk.maps.Map(containerRef.current, { center: new sdk.maps.LatLng(SEOUL.lat, SEOUL.lng), level: 5 });
      mapRef.current = map;
      const [home, work, live] = await Promise.all([
        user.home_address ? geocodeAddress(sdk, user.home_address) : null,
        user.work_address ? geocodeAddress(sdk, user.work_address) : null,
        currentPosition(),
      ]);
      if (cancelled) return;
      startRef.current = live ?? (activeRecord.type === 'commute' ? home : work);
      endRef.current = activeRecord.type === 'commute' ? work : home;
      if (startRef.current) showPosition(startRef.current);
      if (!startRef.current || !endRef.current) {
        setError('출발지 또는 도착지 위치를 확인할 수 없습니다. 주소와 위치 권한을 확인해 주세요.');
        setLoading(false);
      }
      if (endRef.current) {
        const marker = new sdk.maps.Marker({ position: new sdk.maps.LatLng(endRef.current.lat, endRef.current.lng), map });
        routeObjectsRef.current.push(marker);
      }
      if (navigator.geolocation) {
        watchRef.current = navigator.geolocation.watchPosition(({ coords }) => {
          const point = { lat: coords.latitude, lng: coords.longitude };
          startRef.current = point;
          showPosition(point);
        }, () => undefined, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
      }
      setLoading(false);
      setMapReady(true);
    }).catch(() => { setError('지도를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); setLoading(false); });
    return () => {
      cancelled = true;
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      routeObjectsRef.current.forEach((object) => object.setMap(null));
      positionOverlayRef.current?.setMap(null);
    };
  }, [activeRecord.type, showPosition, user.home_address, user.work_address]);

  useEffect(() => {
    if (!mapRef.current || !startRef.current || !endRef.current) return;
    const requestId = ++requestIdRef.current;
    setLoading(true); setError(null); setRoute(null);
    requestRoute(startRef.current, endRef.current, mode)
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        const direct = haversineDistance(startRef.current!, endRef.current!);
        if (data.summary.totalTime > 1440 || direct < 10) throw new Error('비현실적인 경로가 감지되어 표시하지 않았습니다.');
        setRoute(data); drawRoute(data, mode); showPosition(startRef.current!);
      })
      .catch((reason) => {
        if (requestId !== requestIdRef.current) return;
        routeObjectsRef.current.forEach((object) => object.setMap(null));
        routeObjectsRef.current = [];
        setError(reason instanceof Error ? reason.message : '경로를 불러오지 못했습니다.');
      })
      .finally(() => { if (requestId === requestIdRef.current) setLoading(false); });
  }, [drawRoute, mapReady, mode, showPosition]);

  useEffect(() => { const timer = setInterval(() => tick((value) => value + 1), 1000); return () => clearInterval(timer); }, []);

  const arrive = async () => { setArriving(true); try { await onArrive(); } finally { setArriving(false); } };
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white">
      <header className="relative z-20 flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <div><p className="text-[13px] font-semibold text-neutral-900">{activeRecord.type === 'commute' ? '출근 이동 중' : '퇴근 이동 중'}</p><p className="text-[11px] text-neutral-400">현재 위치와 경로를 실시간으로 확인하세요</p></div>
        <button onClick={onClose} aria-label="지도 닫기" className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"><X size={18} /></button>
      </header>
      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
        <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 rounded-full border border-white/80 bg-white/95 p-1 shadow-lg backdrop-blur">
          {(['walk', 'transit'] as const).map((value) => (
            <button key={value} onClick={() => setMode(value)} aria-pressed={mode === value} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${mode === value ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-100'}`}>
              {value === 'walk' ? <Footprints size={13} /> : <Bus size={13} />}{value === 'walk' ? '도보' : '대중교통'}
            </button>
          ))}
        </div>
        {(loading || error) && <div className={`absolute bottom-4 left-4 right-4 z-30 rounded-xl border px-3 py-2.5 text-[12px] shadow-sm ${error ? 'border-red-100 bg-red-50 text-red-700' : 'border-neutral-100 bg-white text-neutral-500'}`}><span className="flex items-center gap-2">{error ? <Navigation size={14} /> : <MapPin size={14} />}{error ?? `${mode === 'walk' ? '도보' : '대중교통'} 경로를 찾고 있어요…`}</span></div>}
        {route && !loading && <div className="absolute bottom-4 left-4 right-4 z-30 rounded-2xl border border-neutral-100 bg-white/95 p-3 shadow-lg backdrop-blur md:left-auto md:w-80">
          <div className="flex items-center justify-between"><strong className="text-[14px] text-neutral-900">약 {route.summary.totalTime}분</strong><span className="text-[11px] text-neutral-400">{(route.summary.totalWalk / 1000).toFixed(1)}km 도보</span></div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto">{route.segments.map((segment, index) => <span key={`${segment.label}-${index}`} className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${segment.trafficType === 1 ? 'bg-emerald-50 text-emerald-700' : segment.trafficType === 2 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{segment.trafficType === 1 ? <TrainFront size={11} /> : segment.trafficType === 2 ? <Bus size={11} /> : <Footprints size={11} />}{segment.label} · {segment.sectionTime}분</span>)}</div>
        </div>}
      </div>
      <footer className="relative z-20 space-y-3 border-t border-neutral-100 bg-white p-4"><p className="text-center font-mono text-[20px] font-semibold tabular-nums">{formatElapsed(activeRecord.start_time)}</p><button onClick={arrive} disabled={arriving} className="w-full rounded-[14px] bg-emerald-500 py-3 text-[14px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">{arriving ? '기록 중…' : '도착'}</button></footer>
    </div>
  );
}
