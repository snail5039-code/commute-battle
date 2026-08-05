'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Navigation, Egg, MapPin } from 'lucide-react';
import { User, CommuteRecord } from '@/lib/types';
import { loadKakaoMapSdk, geocodeAddress } from '@/lib/kakaoMap';
import {
  LatLng,
  haversineDistance,
  distanceToPolyline,
  remainingDistanceAlongPolyline,
  pointAtDistance,
  nearestPointOnPolyline,
} from '@/lib/geo';

interface CommuteMapViewProps {
  user: User;
  activeRecord: CommuteRecord;
  onArrive: () => Promise<void>;
  onClose: () => void;
}

interface RouteSummary {
  totalTime: number | null;
  totalWalk: number | null;
  payment: number | null;
  firstStartStation: string | null;
  lastEndStation: string | null;
}

interface RouteSegment {
  trafficType: number;
  label: string;
  points: LatLng[];
}

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };
const OFF_ROUTE_THRESHOLD_M = 70;
const OFF_ROUTE_STREAK_REQUIRED = 3;
const MAX_ZOOM_LEVEL = 9; // 이보다 더 멀리 줌아웃하지 않음 (경로가 너무 길면 선이 안 보일 정도로 축소되는 것 방지)
const MILESTONE_MINUTES = [10, 5, 2];
const MANUAL_STEP_M = 15;
const RESUME_PROMPT_DELAY_MS = 10000;
const INITIAL_POSITION_TIMEOUT_MS = 8000;

const SEGMENT_STYLE: Record<number, { color: string; dashed?: boolean }> = {
  1: { color: '#22c55e' }, // 지하철
  2: { color: '#3b82f6' }, // 버스
  3: { color: '#94a3b8', dashed: true }, // 도보
};

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function createPulseMarkerEl() {
  const wrapper = document.createElement('div');
  wrapper.className = 'relative w-5 h-5';
  wrapper.innerHTML = `
    <span class="absolute inset-0 rounded-full bg-blue-400 opacity-60 animate-ping"></span>
    <span class="absolute inset-0 rounded-full bg-blue-500 border-2 border-white shadow-md"></span>
  `;
  return wrapper;
}

async function fetchTransitRoute(start: LatLng, dest: LatLng) {
  const params = new URLSearchParams({
    sx: String(start.lng),
    sy: String(start.lat),
    ex: String(dest.lng),
    ey: String(dest.lat),
  });

  const res = await fetch(`/api/route/transit?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.polyline || data.polyline.length < 2) return null;

  return data as { summary: RouteSummary; segments: RouteSegment[]; polyline: LatLng[] };
}

function getInitialPosition(timeoutMs = INITIAL_POSITION_TIMEOUT_MS): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    let done = false;
    const finish = (value: LatLng | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10000 }
    );
  });
}

export default function CommuteMapView({
  user,
  activeRecord,
  onArrive,
  onClose,
}: CommuteMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const myMarkerRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const trailLineRef = useRef<kakao.maps.Polyline | null>(null);
  const trailRef = useRef<kakao.maps.LatLng[]>([]);
  const watchIdRef = useRef<number | null>(null);

  const routePolylineRef = useRef<LatLng[]>([]);
  const routeTotalDistanceRef = useRef(0);
  const routeTotalTimeRef = useRef<number | null>(null);
  const offRouteStreakRef = useRef(0);
  const announcedMinutesRef = useRef<Set<number>>(new Set());

  const manualModeRef = useRef(false);
  const simDistanceRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [now, setNow] = useState(() => new Date());
  const [arriving, setArriving] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [offRoute, setOffRoute] = useState(false);
  const [petMessage, setPetMessage] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  const destLabel = activeRecord.type === 'commute' ? '회사' : '집';

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let keyHandler: ((e: KeyboardEvent) => void) | null = null;
    let clickHandler: ((e: kakao.maps.MouseEvent) => void) | null = null;
    let mapInstance: kakao.maps.Map | null = null;

    loadKakaoMapSdk()
      .then(async (kakao) => {
        if (cancelled || !containerRef.current) return;

        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng),
          level: 5,
        });
        mapRef.current = map;
        mapInstance = map;

        const enterManualMode = () => {
          manualModeRef.current = true;
          setManualMode(true);
          setShowResumePrompt(false);
          if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
          resumeTimerRef.current = setTimeout(
            () => setShowResumePrompt(true),
            RESUME_PROMPT_DELAY_MS
          );
        };

        const applyPosition = (plainPoint: LatLng) => {
          if (!mapRef.current) return;
          const point = new kakao.maps.LatLng(plainPoint.lat, plainPoint.lng);

          if (!myMarkerRef.current) {
            myMarkerRef.current = new kakao.maps.CustomOverlay({
              position: point,
              content: createPulseMarkerEl(),
              zIndex: 10,
            });
            myMarkerRef.current.setMap(mapRef.current);
            mapRef.current.setCenter(point);
            mapRef.current.setLevel(4);
          } else {
            myMarkerRef.current.setPosition(point);
            mapRef.current.panTo(point);
          }

          trailRef.current = [...trailRef.current, point];
          trailLineRef.current?.setPath(trailRef.current);
          setReady(true);

          const routePolyline = routePolylineRef.current;
          if (routePolyline.length >= 2) {
            const distOff = distanceToPolyline(plainPoint, routePolyline);
            offRouteStreakRef.current =
              distOff > OFF_ROUTE_THRESHOLD_M ? offRouteStreakRef.current + 1 : 0;
            const isOffRoute = offRouteStreakRef.current >= OFF_ROUTE_STREAK_REQUIRED;
            setOffRoute(isOffRoute);

            if (isOffRoute) {
              setPetMessage('어? 지금 경로에서 벗어난 것 같아! 다시 확인해봐');
            } else {
              const remaining = remainingDistanceAlongPolyline(plainPoint, routePolyline);
              const totalTime = routeTotalTimeRef.current;
              if (totalTime && routeTotalDistanceRef.current > 0) {
                const estimatedMinutes = Math.max(
                  1,
                  Math.round(totalTime * (remaining / routeTotalDistanceRef.current))
                );
                const nextMilestone = MILESTONE_MINUTES.find(
                  (m) => estimatedMinutes <= m && !announcedMinutesRef.current.has(m)
                );
                if (nextMilestone) {
                  announcedMinutesRef.current.add(nextMilestone);
                  setPetMessage(`${destLabel}까지 이제 ${estimatedMinutes}분밖에 안 남았어!`);
                }
              }
            }
          }
        };

        const [homeCoord, workCoord, liveStart] = await Promise.all([
          user.home_address ? geocodeAddress(kakao, user.home_address) : Promise.resolve(null),
          user.work_address ? geocodeAddress(kakao, user.work_address) : Promise.resolve(null),
          getInitialPosition(),
        ]);

        if (cancelled) return;

        const addressStartCoord = activeRecord.type === 'commute' ? homeCoord : workCoord;
        const destCoord = activeRecord.type === 'commute' ? workCoord : homeCoord;
        const startCoord = liveStart ?? addressStartCoord;

        if (!liveStart && startCoord) {
          new kakao.maps.Marker({
            position: new kakao.maps.LatLng(startCoord.lat, startCoord.lng),
            map,
          });
        }
        if (destCoord) {
          new kakao.maps.Marker({
            position: new kakao.maps.LatLng(destCoord.lat, destCoord.lng),
            map,
          });
        }

        if (startCoord && destCoord) {
          const route = await fetchTransitRoute(startCoord, destCoord);

          if (!cancelled && route) {
            route.segments.forEach((segment) => {
              const style = SEGMENT_STYLE[segment.trafficType] ?? SEGMENT_STYLE[3];
              const line = new kakao.maps.Polyline({
                path: segment.points.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
                strokeWeight: style.dashed ? 3 : 5,
                strokeColor: style.color,
                strokeOpacity: 0.9,
                strokeStyle: style.dashed ? 'shortdash' : 'solid',
              });
              line.setMap(map);
            });

            routePolylineRef.current = route.polyline;
            routeTotalDistanceRef.current = route.polyline.reduce(
              (sum, p, i) => (i === 0 ? 0 : sum + haversineDistance(route.polyline[i - 1], p)),
              0
            );
            setRouteSummary(route.summary);
            routeTotalTimeRef.current = route.summary.totalTime;
            if (route.summary.totalTime) {
              setPetMessage(
                `${destLabel}까지 대략 ${route.summary.totalTime}분 걸릴 것 같아, 화이팅!`
              );
            }

            const bounds = new kakao.maps.LatLngBounds();
            route.polyline.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
            map.setBounds(bounds);
            if (map.getLevel() > MAX_ZOOM_LEVEL) {
              map.setLevel(MAX_ZOOM_LEVEL);
              map.setCenter(new kakao.maps.LatLng(startCoord.lat, startCoord.lng));
            }
          } else if (!cancelled) {
            const fallbackLine = new kakao.maps.Polyline({
              path: [
                new kakao.maps.LatLng(startCoord.lat, startCoord.lng),
                new kakao.maps.LatLng(destCoord.lat, destCoord.lng),
              ],
              strokeWeight: 3,
              strokeColor: '#94a3b8',
              strokeOpacity: 0.8,
              strokeStyle: 'shortdash',
            });
            fallbackLine.setMap(map);
            routePolylineRef.current = [startCoord, destCoord];
            routeTotalDistanceRef.current = haversineDistance(startCoord, destCoord);
            map.setCenter(
              new kakao.maps.LatLng(
                (startCoord.lat + destCoord.lat) / 2,
                (startCoord.lng + destCoord.lng) / 2
              )
            );
          }
        } else if (startCoord) {
          map.setCenter(new kakao.maps.LatLng(startCoord.lat, startCoord.lng));
        }

        trailLineRef.current = new kakao.maps.Polyline({
          path: [],
          strokeWeight: 5,
          strokeColor: '#1d4ed8',
          strokeOpacity: 0.9,
        });
        trailLineRef.current.setMap(map);

        keyHandler = (e: KeyboardEvent) => {
          if (routePolylineRef.current.length < 2) return;
          const key = e.key.toLowerCase();
          let delta = 0;
          if (['w', 'd', 'arrowup', 'arrowright'].includes(key)) delta = MANUAL_STEP_M;
          else if (['s', 'a', 'arrowdown', 'arrowleft'].includes(key)) delta = -MANUAL_STEP_M;
          else return;

          e.preventDefault();
          simDistanceRef.current = Math.max(
            0,
            Math.min(routeTotalDistanceRef.current, simDistanceRef.current + delta)
          );
          enterManualMode();
          applyPosition(pointAtDistance(routePolylineRef.current, simDistanceRef.current));
        };
        window.addEventListener('keydown', keyHandler);

        clickHandler = (mouseEvent: kakao.maps.MouseEvent) => {
          if (routePolylineRef.current.length < 2) return;
          const clicked: LatLng = {
            lat: mouseEvent.latLng.getLat(),
            lng: mouseEvent.latLng.getLng(),
          };
          const { point, distanceFromStart } = nearestPointOnPolyline(
            clicked,
            routePolylineRef.current
          );
          simDistanceRef.current = distanceFromStart;
          enterManualMode();
          applyPosition(point);
        };
        kakao.maps.event.addListener(map, 'click', clickHandler);

        if (liveStart) {
          applyPosition(liveStart);
        }

        if (!navigator.geolocation) {
          setGpsError('이 기기에서는 위치 정보를 사용할 수 없습니다');
          setReady(true);
          return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            if (cancelled || manualModeRef.current) return;
            setGpsError(null);
            applyPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          (err) => {
            if (manualModeRef.current) return;
            setGpsError(
              err.code === err.PERMISSION_DENIED
                ? '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요'
                : '위치를 가져올 수 없습니다'
            );
            setReady(true);
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
      })
      .catch(() => {
        setGpsError('지도를 불러오지 못했습니다');
        setReady(true);
      });

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (keyHandler) window.removeEventListener('keydown', keyHandler);
      if (clickHandler && mapInstance && typeof window !== 'undefined' && window.kakao?.maps?.event) {
        window.kakao.maps.event.removeListener(mapInstance, 'click', clickHandler);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.home_address, user.work_address, activeRecord.type, destLabel]);

  const elapsedMs = now.getTime() - new Date(activeRecord.start_time!).getTime();

  const handleArrive = async () => {
    setArriving(true);
    try {
      await onArrive();
    } finally {
      setArriving(false);
    }
  };

  const resumeTracking = () => {
    manualModeRef.current = false;
    setManualMode(false);
    setShowResumePrompt(false);
  };

  return (
    <div className="absolute inset-0 z-10 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div>
          <p className="text-[13px] font-semibold text-neutral-900">
            {activeRecord.type === 'commute' ? '출근 이동 중' : '퇴근 이동 중'}
          </p>
          <p className="text-[11px] text-neutral-400">
            {routeSummary?.firstStartStation && routeSummary?.lastEndStation
              ? `${routeSummary.firstStartStation} → ${routeSummary.lastEndStation}`
              : '실시간 위치를 추적하고 있어요'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[13px] text-neutral-400">
            지도를 불러오는 중...
          </div>
        )}

        {petMessage && (
          <div
            className={`absolute top-3 left-3 right-3 flex items-start gap-2 px-3 py-2.5 rounded-[12px] text-[12px] font-medium shadow-sm ${
              offRoute
                ? 'bg-red-50 text-red-600'
                : 'bg-white text-neutral-700 border border-neutral-100'
            }`}
          >
            <Egg size={16} className={offRoute ? 'text-red-500 shrink-0' : 'text-amber-500 shrink-0'} />
            <span className="leading-relaxed">{petMessage}</span>
          </div>
        )}

        {showResumePrompt ? (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 bg-amber-50 text-amber-700 text-[12px] font-medium px-3 py-2 rounded-[10px]">
            <span>위치 추적이 멈춰있어요. 다시 연결할까요?</span>
            <button
              onClick={resumeTracking}
              className="shrink-0 px-2.5 py-1 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold transition-colors"
            >
              연결
            </button>
          </div>
        ) : manualMode ? (
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 bg-blue-50 text-blue-600 text-[12px] font-medium px-3 py-2 rounded-[10px]">
            <MapPin size={14} />
            수동으로 위치를 옮기는 중이에요
          </div>
        ) : gpsError ? (
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 bg-red-50 text-red-600 text-[12px] font-medium px-3 py-2 rounded-[10px]">
            <Navigation size={14} />
            {gpsError}
          </div>
        ) : (
          <p className="absolute bottom-3 left-3 text-[10px] text-neutral-400 bg-white/80 px-2 py-1 rounded-full">
            지도를 클릭하거나 방향키/WASD로 이동해볼 수 있어요
          </p>
        )}
      </div>

      <div className="border-t border-neutral-100 p-4 space-y-3">
        <p className="text-center text-[20px] font-mono font-semibold text-neutral-900 tabular-nums">
          {formatElapsed(elapsedMs)}
        </p>
        <button
          onClick={handleArrive}
          disabled={arriving}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[14px] text-[14px] font-semibold disabled:opacity-50 transition-colors"
        >
          {arriving ? '기록 중...' : '도착'}
        </button>
      </div>
    </div>
  );
}
