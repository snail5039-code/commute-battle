'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bus, ChevronDown, ChevronUp, Clock3, Crosshair, Footprints, MapPin, Navigation, Sparkles, TrainFront, X } from 'lucide-react';
import { CommuteRecord, User } from '@/lib/types';
import { haversineDistance, LatLng } from '@/lib/geo';
import { geocodeAddress, loadKakaoMapSdk } from '@/lib/kakaoMap';
import { generateRouteComment, RouteComment } from '@/lib/gemini';
import { resetRouteNotifications, showRouteNotificationOnce } from '@/lib/notifications';
import type { RouteIntelligence } from '@/lib/routeIntelligence';

interface CommuteMapViewProps { user: User; activeRecord: CommuteRecord; onArrive: () => Promise<void>; onClose: () => void }
type TravelMode = 'walk' | 'transit';
type StartBasis = 'current' | 'saved';
type LocationStatus = 'locating' | 'tracking' | 'fallback' | 'unavailable';
interface RouteSegment {
  trafficType: number;
  providerTrafficType?: number | null;
  label: string;
  instruction?: string | null;
  distance: number;
  sectionTime: number;
  points: LatLng[];
  startName?: string | null;
  endName?: string | null;
  laneName?: string | null;
  congestion?: string | number | null;
  transfer?: boolean;
  geometrySource?: string | null;
  estimatedGeometry?: boolean;
}
interface RouteResponse {
  id?: string;
  summary: { totalTime: number; totalDistance: number; totalWalk: number; payment: number; firstStartStation: string | null; lastEndStation: string | null };
  segments: RouteSegment[];
  polyline: LatLng[];
  estimated?: boolean;
  provider?: string;
  intelligence?: RouteIntelligence;
  candidates?: RouteResponse[];
}

const SEOUL = { lat: 37.5665, lng: 126.978 };
const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 };
const ROUTE_REFRESH_DISTANCE_M = 100;
const ROUTE_REFRESH_INTERVAL_MS = 30000;
const CURRENT_LOCATION_LEVEL = 3;
const SEGMENT_COLORS: Record<number, string> = { 1: '#10b981', 2: '#2563eb', 3: '#64748b' };
const CONNECTION_GAP_M = 1;
const LONG_WALK_WARNING_M = 1000;
const APPROACH_NOTICE_M = 450;

const BADGE_LABEL = { fastest: '빠른 경로', 'least-walking': '도보 적은 경로', 'fewest-transfers': '환승 적은 경로' } as const;

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
function formatSteps(metres: number) { return `약 ${Math.max(0, Math.round(metres / 0.75)).toLocaleString('ko-KR')}보`; }
function formatClock(date: Date) { return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); }
function coordinates(position: GeolocationPosition): LatLng { return { lat: position.coords.latitude, lng: position.coords.longitude }; }

function locationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return '위치 권한이 거부되어 등록된 출발 주소를 사용합니다.';
  if (error.code === error.TIMEOUT) return '현재 위치 확인 시간이 초과되어 등록된 출발 주소를 사용합니다.';
  return '현재 위치를 확인할 수 없어 등록된 출발 주소를 사용합니다.';
}

async function requestRoute(start: LatLng, end: LatLng, mode: TravelMode): Promise<RouteResponse> {
  const query = new URLSearchParams({ sx: String(start.lng), sy: String(start.lat), ex: String(end.lng), ey: String(end.lat), mode });
  const response = await fetch(`/api/route/transit?${query}`);
  const data = await response.json();
  if (!response.ok) {
    if (mode === 'walk' && data.code === 'WALK_DISTANCE_EXCEEDED' && data.fallback?.type === 'direct-distance' && Number.isFinite(data.fallback.directDistance)) {
      const distance = data.fallback.directDistance as number;
      const minutes = Math.max(1, Math.round(distance / 80));
      return {
        summary: { totalTime: minutes, totalDistance: distance, totalWalk: distance, payment: 0, firstStartStation: null, lastEndStation: null },
        segments: [{ trafficType: 3, label: '참고용 직선 안내', distance, sectionTime: minutes, points: [start, end] }],
        polyline: [start, end],
        estimated: true,
        provider: typeof data.provider === 'string' ? data.provider : undefined,
      };
    }
    throw new Error(data.detail || data.error || '경로를 불러오지 못했습니다.');
  }
  if (!Array.isArray(data.polyline) || data.polyline.length < 2 || !Number.isFinite(data.summary?.totalTime)) throw new Error('경로 응답 형식이 올바르지 않습니다.');
  return {
    ...data,
    estimated: Boolean(data.isEstimated ?? data.estimated),
    provider: typeof data.provider === 'string' ? data.provider : undefined,
  } as RouteResponse;
}

function dot(color: string, label: string) {
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
  element.title = label;
  element.style.cssText = `width:18px;height:18px;border:3px solid white;border-radius:50%;background:${color};box-shadow:0 2px 8px #0f172a55`;
  return element;
}

function pin(label: string) {
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
  element.style.cssText = 'display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px #0f172a44);transform:translateY(-4px)';
  const text = document.createElement('span');
  text.textContent = label;
  text.style.cssText = 'white-space:nowrap;margin-bottom:3px;padding:3px 7px;border-radius:8px;background:#fff;color:#b91c1c;font:700 11px system-ui;border:1px solid #fecaca';
  const marker = document.createElement('span');
  marker.textContent = '●';
  marker.style.cssText = 'display:grid;place-items:center;width:25px;height:25px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#ef4444;color:white;border:2px solid white;font-size:10px';
  element.append(text, marker);
  return element;
}

function unavailableGeometryMarker(label: string, walking = false) {
  const message = walking ? '상세 도보 경로 미제공' : '상세 경로 미제공';
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', `${label} ${message}`);
  element.style.cssText = 'white-space:nowrap;padding:3px 7px;border-radius:999px;background:#fff7ed;color:#9a3412;font:700 10px system-ui;border:1px solid #fdba74;box-shadow:0 2px 6px #0f172a33';
  element.textContent = message;
  return element;
}

function transitStage(segment: RouteSegment) {
  if (segment.providerTrafficType === 5) return '시외버스';
  if (segment.providerTrafficType === 6) return '고속버스';
  if (segment.trafficType === 2) return '시내버스';
  if (segment.providerTrafficType === 4) return '기차';
  return '지하철';
}

function isRoadReference(segment: RouteSegment) {
  return /tmap.*(?:road|vehicle)|(?:road|vehicle).*tmap/i.test(segment.geometrySource || '');
}

function hasActualTransitGeometry(segment: RouteSegment) {
  if (segment.points.length < 3 || segment.estimatedGeometry) return false;
  if (/endpoint|estimate|missing|none/i.test(segment.geometrySource || '')) return false;
  return !isRoadReference(segment);
}

function isUnavailableWalkingGeometry(segment: RouteSegment) {
  return segment.trafficType === 3 && segment.geometrySource === 'unavailable';
}

export default function CommuteMapView({ user, activeRecord, onArrive, onClose }: CommuteMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const routeOverlaysRef = useRef<Array<{ setMap(map: kakao.maps.Map | null): void }>>([]);
  const fixedOverlaysRef = useRef<Array<{ setMap(map: kakao.maps.Map | null): void }>>([]);
  const currentOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const watchRef = useRef<number | null>(null);
  const currentLocationRef = useRef<LatLng | null>(null);
  const routeRef = useRef<RouteResponse | null>(null);
  const addressStartRef = useRef<LatLng | null>(null);
  const startRef = useRef<LatLng | null>(null);
  const endRef = useRef<LatLng | null>(null);
  const lastRouteOriginRef = useRef<LatLng | null>(null);
  const lastRouteAtRef = useRef(0);
  const requestIdRef = useRef(0);
  const lastRequestKeyRef = useRef('');
  const startBasisRef = useRef<StartBasis>('current');
  const userCenteredRef = useRef(false);
  const initialViewportSetRef = useRef(false);
  const [mode, setMode] = useState<TravelMode>('transit');
  const [startBasis, setStartBasis] = useState<StartBasis>('current');
  const [routePoints, setRoutePoints] = useState<{ start: LatLng; end: LatLng } | null>(null);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeDepartureAt, setRouteDepartureAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [hasCurrentLocation, setHasCurrentLocation] = useState(false);
  const [hasSavedStart, setHasSavedStart] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('locating');
  const [locationNotice, setLocationNotice] = useState('현재 위치를 확인하고 있습니다.');
  const [destinationAddress, setDestinationAddress] = useState('도착지 주소 확인 중');
  const [savedStartAddress, setSavedStartAddress] = useState('저장된 출발지 주소 확인 중');
  const [error, setError] = useState<string | null>(null);
  const [arriving, setArriving] = useState(false);
  const [routeComment, setRouteComment] = useState<RouteComment | null>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentOpen, setCommentOpen] = useState(true);
  const [, tick] = useState(0);

  useEffect(() => { routeRef.current = route; }, [route]);

  const clearRoute = useCallback(() => {
    routeOverlaysRef.current.forEach((object) => object.setMap(null));
    routeOverlaysRef.current = [];
  }, []);

  const clearFixedMarkers = useCallback(() => {
    fixedOverlaysRef.current.forEach((object) => object.setMap(null));
    fixedOverlaysRef.current = [];
  }, []);

  const showCurrentPosition = useCallback((point: LatLng, recenter = false) => {
    currentLocationRef.current = point;
    const map = mapRef.current;
    if (!map) return;
    const position = new window.kakao.maps.LatLng(point.lat, point.lng);
    if (!currentOverlayRef.current) {
      currentOverlayRef.current = new window.kakao.maps.CustomOverlay({ position, content: dot('#2563eb', '현재 위치'), zIndex: 30 });
      currentOverlayRef.current.setMap(map);
    } else currentOverlayRef.current.setPosition(position);
    if (recenter) {
      map.setLevel(CURRENT_LOCATION_LEVEL);
      map.panTo(position);
    }
  }, []);

  const showFixedMarkers = useCallback(() => {
    const map = mapRef.current;
    const start = addressStartRef.current;
    const end = endRef.current;
    if (!map || !start || !end) return;
    clearFixedMarkers();
    const startMarker = new window.kakao.maps.CustomOverlay({
      position: new window.kakao.maps.LatLng(start.lat, start.lng), content: dot('#0f172a', '출발 주소'), zIndex: 20,
    });
    const endMarker = new window.kakao.maps.CustomOverlay({
      position: new window.kakao.maps.LatLng(end.lat, end.lng), content: pin('도착지'), yAnchor: 1, zIndex: 21,
    });
    startMarker.setMap(map);
    endMarker.setMap(map);
    fixedOverlaysRef.current = [startMarker, endMarker];
  }, [clearFixedMarkers]);

  const drawRoute = useCallback((data: RouteResponse, selectedMode: TravelMode) => {
    const map = mapRef.current;
    const start = startRef.current;
    const end = endRef.current;
    if (!map || !start || !end) return;
    clearRoute();
    const bounds = new window.kakao.maps.LatLngBounds();
    [start, end].forEach((point) => bounds.extend(new window.kakao.maps.LatLng(point.lat, point.lng)));
    const drawableSegments = data.segments.filter((segment) => segment.points.length >= 2);
    const sourceSegments: RouteSegment[] = drawableSegments.length ? drawableSegments : [{ trafficType: 3, label: '경로', distance: data.summary.totalDistance, sectionTime: data.summary.totalTime, points: data.polyline }];
    if (selectedMode === 'transit') {
      sourceSegments.forEach((segment) => {
        if (segment.trafficType === 3 && !isUnavailableWalkingGeometry(segment)) return;
        if (segment.trafficType !== 3 && (hasActualTransitGeometry(segment) || isRoadReference(segment))) return;
        [segment.points[0], segment.points.at(-1)].filter((point): point is LatLng => Boolean(point)).forEach((point) => {
          const marker = new window.kakao.maps.CustomOverlay({
            position: new window.kakao.maps.LatLng(point.lat, point.lng),
            content: unavailableGeometryMarker(segment.label, segment.trafficType === 3),
            yAnchor: 1.4,
            zIndex: 18,
          });
          marker.setMap(map);
          routeOverlaysRef.current.push(marker);
        });
      });
    }
    // Preserve continuous walking-mode rendering for cached/older responses. In
    // transit mode, synthetic two-point connectors are intentionally not drawn.
    const segments: RouteSegment[] = [];
    let cursor = start;
    sourceSegments.forEach((segment) => {
      const first = segment.points[0];
      if (haversineDistance(cursor, first) > CONNECTION_GAP_M) {
        segments.push({ trafficType: 3, label: '도보 연결', distance: haversineDistance(cursor, first), sectionTime: 0, points: [cursor, first], geometrySource: 'endpoint-connector', estimatedGeometry: true });
      }
      segments.push(segment);
      cursor = segment.points.at(-1)!;
    });
    if (haversineDistance(cursor, end) > CONNECTION_GAP_M) {
      segments.push({ trafficType: 3, label: '도보 연결', distance: haversineDistance(cursor, end), sectionTime: 0, points: [cursor, end], geometrySource: 'endpoint-connector', estimatedGeometry: true });
    }
    segments.forEach((segment) => {
      const roadReference = selectedMode === 'transit' && isRoadReference(segment);
      if (selectedMode === 'transit' && segment.trafficType !== 3 && !hasActualTransitGeometry(segment) && !roadReference) return;
      if (selectedMode === 'transit' && isUnavailableWalkingGeometry(segment)) return;
      if (selectedMode === 'transit' && segment.trafficType === 3 && segment.points.length === 2 && (segment.estimatedGeometry || segment.label === '도보 연결')) return;
      const path = segment.points.map((point) => { const value = new window.kakao.maps.LatLng(point.lat, point.lng); bounds.extend(value); return value; });
      const color = selectedMode === 'walk' ? '#334155' : roadReference ? '#f97316' : (SEGMENT_COLORS[segment.trafficType] ?? '#64748b');
      const line = new window.kakao.maps.Polyline({ path, strokeWeight: roadReference ? 5 : segment.trafficType === 3 ? 4 : 7, strokeColor: color, strokeOpacity: roadReference ? 0.75 : 0.9, strokeStyle: roadReference || data.estimated || segment.trafficType === 3 ? 'shortdash' : 'solid' });
      line.setMap(map);
      routeOverlaysRef.current.push(line);
    });
    if (!userCenteredRef.current) map.setBounds(bounds);
  }, [clearRoute]);

  useEffect(() => {
    let cancelled = false;
    let initialPositionSettled = false;
    const initialPosition = navigator.geolocation
      ? new Promise<{ position: GeolocationPosition; error?: never } | { position?: never; error: GeolocationPositionError }>((resolve) => {
          navigator.geolocation.getCurrentPosition((position) => resolve({ position }), (error) => resolve({ error }), GEO_OPTIONS);
        })
      : null;

    const acceptLivePosition = (position: GeolocationPosition, initial: boolean) => {
      if (cancelled) return;
      const point = coordinates(position);
      const shouldSetInitialViewport = initial && !initialViewportSetRef.current;
      if (shouldSetInitialViewport) {
        initialViewportSetRef.current = true;
        userCenteredRef.current = true;
      }
      showCurrentPosition(point, shouldSetInitialViewport);
      setHasCurrentLocation(true);
      setLocationStatus('tracking');
      setLocationNotice(`현재 위치 사용 중 · 정확도 약 ${Math.round(position.coords.accuracy)}m`);
      const activeRoute = routeRef.current;
      if (activeRoute && position.coords.accuracy <= 120) {
        const upcoming = activeRoute.segments.find((segment) => segment.trafficType !== 3 && segment.points[0] && haversineDistance(point, segment.points[0]) <= APPROACH_NOTICE_M);
        const finalTransit = activeRoute.segments.findLast((segment) => segment.trafficType !== 3);
        if (upcoming) {
          const metres = Math.round(haversineDistance(point, upcoming.points[0]));
          showRouteNotificationOnce(`${activeRoute.id}:board:${upcoming.startName || upcoming.label}`, '승차 지점에 접근 중', `${upcoming.startName || upcoming.label}까지 확인된 거리 약 ${metres}m입니다.`);
        }
        if (finalTransit?.points.at(-1)) {
          const metres = Math.round(haversineDistance(point, finalTransit.points.at(-1)!));
          if (metres <= APPROACH_NOTICE_M) showRouteNotificationOnce(`${activeRoute.id}:alight:${finalTransit.endName || finalTransit.label}`, '하차 지점에 접근 중', `${finalTransit.endName || '하차 지점'}까지 확인된 거리 약 ${metres}m입니다. 하차 후 목적지 경로를 확인하세요.`);
        }
      }
      const previousOrigin = lastRouteOriginRef.current;
      const shouldRefresh = !previousOrigin || (Date.now() - lastRouteAtRef.current >= ROUTE_REFRESH_INTERVAL_MS && haversineDistance(previousOrigin, point) >= ROUTE_REFRESH_DISTANCE_M);
      if (startBasisRef.current === 'current' && (initial || shouldRefresh)) {
        startRef.current = point;
        if (endRef.current) setRoutePoints({ start: point, end: endRef.current });
      }
    };

    loadKakaoMapSdk().then(async (sdk) => {
      if (cancelled || !containerRef.current) return;
      mapRef.current = new sdk.maps.Map(containerRef.current, { center: new sdk.maps.LatLng(SEOUL.lat, SEOUL.lng), level: 5 });
      const [home, work] = await Promise.all([user.home_address ? geocodeAddress(sdk, user.home_address) : null, user.work_address ? geocodeAddress(sdk, user.work_address) : null]);
      if (cancelled) return;
      const addressStart = activeRecord.type === 'commute' ? home : work;
      addressStartRef.current = addressStart;
      setHasSavedStart(Boolean(addressStart));
      endRef.current = activeRecord.type === 'commute' ? work : home;
      setSavedStartAddress((activeRecord.type === 'commute' ? user.home_address : user.work_address) || '등록된 출발지 주소 없음');
      setDestinationAddress((activeRecord.type === 'commute' ? user.work_address : user.home_address) || '등록된 도착지 주소 없음');

      const applyFallback = (notice: string) => {
        if (cancelled || initialPositionSettled) return;
        initialPositionSettled = true;
        startRef.current = addressStart;
        startBasisRef.current = 'saved';
        setStartBasis('saved');
        setLocationStatus(addressStart ? 'fallback' : 'unavailable');
        setLocationNotice(notice);
        setMapReady(true);
        setLoading(false);
        showFixedMarkers();
        if (addressStart && endRef.current) setRoutePoints({ start: addressStart, end: endRef.current });
      };

      if (!initialPosition) applyFallback('브라우저가 위치 정보를 지원하지 않아 등록된 출발 주소를 사용합니다.');
      else {
        const result = await initialPosition;
        if (cancelled) return;
        if (result.position) {
          initialPositionSettled = true;
          acceptLivePosition(result.position, true);
          setMapReady(true);
          setLoading(false);
          watchRef.current = navigator.geolocation.watchPosition((update) => acceptLivePosition(update, false), (watchError) => setLocationNotice(locationErrorMessage(watchError)), GEO_OPTIONS);
        } else applyFallback(locationErrorMessage(result.error));
      }
      showFixedMarkers();
      if (!endRef.current) setError('도착지 위치를 확인할 수 없습니다. 등록된 주소를 확인해 주세요.');
    }).catch(() => {
      if (!cancelled) { setError('지도를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); setLoading(false); setLocationStatus('unavailable'); }
    });
    return () => {
      cancelled = true;
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      requestIdRef.current += 1;
      clearRoute();
      clearFixedMarkers();
      currentOverlayRef.current?.setMap(null);
      currentOverlayRef.current = null;
      mapRef.current = null;
    };
  }, [activeRecord.type, clearFixedMarkers, clearRoute, showCurrentPosition, showFixedMarkers, user.home_address, user.work_address]);

  useEffect(() => {
    if (!mapReady || !routePoints) return;
    const { start, end } = routePoints;
    const selectedMode = mode;
    const requestKey = `${selectedMode}:${start.lat},${start.lng}:${end.lat},${end.lng}`;
    if (requestKey === lastRequestKeyRef.current) return;
    lastRequestKeyRef.current = requestKey;
    const requestId = ++requestIdRef.current;
    lastRouteOriginRef.current = start;
    lastRouteAtRef.current = Date.now();
    setLoading(true);
    setError(null);
    setRoute(null);
    clearRoute();
    showFixedMarkers();
    requestRoute(start, end, selectedMode).then((data) => {
      if (requestId !== requestIdRef.current || selectedMode !== mode) return;
      setRouteDepartureAt(Date.now());
      setRouteComment(null);
      setCommentLoading(true);
      setCommentError(null);
      setRoute(data);
      resetRouteNotifications();
      drawRoute(data, selectedMode);
    }).catch((reason) => {
      if (requestId === requestIdRef.current) setError(reason instanceof Error ? reason.message : '경로를 불러오지 못했습니다.');
    }).finally(() => {
      if (requestId === requestIdRef.current) setLoading(false);
    });
  }, [clearRoute, drawRoute, mapReady, mode, routePoints, showFixedMarkers]);

  useEffect(() => { const timer = setInterval(() => tick((value) => value + 1), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!route) return;
    let cancelled = false;
    generateRouteComment({
      segments: route.segments,
      totalTime: route.summary.totalTime,
      totalDistance: route.summary.totalDistance,
      totalWalk: route.summary.totalWalk,
      departureTime: new Date(routeDepartureAt),
    }).then((comment) => {
      if (!cancelled) setRouteComment(comment);
    }).catch(() => {
      if (!cancelled) setCommentError('경로 코멘트를 준비하지 못했어요. 잠시 후 경로를 다시 확인해 주세요.');
    }).finally(() => {
      if (!cancelled) setCommentLoading(false);
    });
    return () => { cancelled = true; };
  }, [route, routeDepartureAt]);
  const arrive = async () => { setArriving(true); try { await onArrive(); } finally { setArriving(false); } };
  const recenter = () => {
    if (!currentLocationRef.current) return;
    userCenteredRef.current = true;
    showCurrentPosition(currentLocationRef.current, true);
  };
  const changeMode = (nextMode: TravelMode) => {
    if (nextMode === mode) return;
    requestIdRef.current += 1;
    clearRoute();
    setRoute(null);
    setError(null);
    setLoading(true);
    setMode(nextMode);
  };
  const changeStartBasis = (nextBasis: StartBasis) => {
    if (nextBasis === startBasis) return;
    const nextStart = nextBasis === 'current' ? currentLocationRef.current : addressStartRef.current;
    if (!nextStart || !endRef.current) return;
    requestIdRef.current += 1;
    startBasisRef.current = nextBasis;
    startRef.current = nextStart;
    setRoute(null);
    setError(null);
    setLoading(true);
    setStartBasis(nextBasis);
    setRoutePoints({ start: nextStart, end: endRef.current });
  };

  const selectCandidate = (candidate: RouteResponse) => {
    const selected = { ...candidate, candidates: route?.candidates || [] };
    setRoute(selected);
    routeRef.current = selected;
    resetRouteNotifications();
    drawRoute(selected, mode);
  };

  const hasUnavailableTransitGeometry = mode === 'transit' && Boolean(route?.segments.some((segment) => segment.trafficType !== 3 && !hasActualTransitGeometry(segment) && !isRoadReference(segment)));
  const hasUnavailableWalkingGeometry = mode === 'transit' && Boolean(route?.segments.some(isUnavailableWalkingGeometry));
  const hasRoadReference = mode === 'transit' && Boolean(route?.segments.some(isRoadReference));

  const panel = (
    <aside className="flex max-h-[46vh] flex-col bg-white p-4 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] md:h-full md:max-h-none md:w-[360px] md:shrink-0 md:border-l md:border-neutral-200 md:shadow-none">
      <div className="mb-3 flex w-fit rounded-full bg-neutral-100 p-1">
        {(['walk', 'transit'] as const).map((value) => <button key={value} onClick={() => changeMode(value)} aria-pressed={mode === value} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ${mode === value ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500'}`}>{value === 'walk' ? <Footprints size={13} /> : <Bus size={13} />}{value === 'walk' ? '도보' : '대중교통'}</button>)}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1" aria-label="출발 기준">
        {(['current', 'saved'] as const).map((value) => <button key={value} type="button" onClick={() => changeStartBasis(value)} disabled={value === 'current' ? !hasCurrentLocation : !hasSavedStart} aria-pressed={startBasis === value} className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${startBasis === value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>{value === 'current' ? '현재 위치에서' : '저장한 주소에서'}</button>)}
      </div>
      <div className="mb-3 space-y-2 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
        <p className="flex items-start gap-2"><Navigation className={locationStatus === 'locating' ? 'animate-pulse text-blue-600' : 'text-blue-600'} size={15} /><span><strong className="font-semibold text-neutral-700">출발 · {startBasis === 'current' ? '현재 위치' : '저장한 주소'}</strong><br />{startBasis === 'current' ? locationNotice : savedStartAddress}</span></p>
        <p className="flex items-start gap-2"><MapPin className="text-red-500" size={15} /><span><strong className="font-semibold text-neutral-700">도착지</strong> · {destinationAddress}</span></p>
      </div>
      {route?.estimated && !loading && <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800"><strong className="block">참고용 직선 안내</strong>실제 보행 경로가 아닌 직선거리 기준 예상 안내입니다.</div>}
      {mode === 'transit' && route?.candidates && route.candidates.length > 1 && !loading && <div className="mb-3 grid gap-2" aria-label="대중교통 경로 선택">{route.candidates.map((candidate, index) => <button key={candidate.id || index} type="button" onClick={() => selectCandidate(candidate)} aria-pressed={candidate.id === route.id} className={`rounded-xl border p-3 text-left ${candidate.id === route.id ? 'border-blue-500 bg-blue-50' : 'border-neutral-200 bg-white'}`}><span className="flex flex-wrap gap-1">{candidate.intelligence?.badges.map((badge) => <span key={badge} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{BADGE_LABEL[badge]}</span>)}</span><span className="mt-1 block text-sm font-bold text-neutral-900">{formatMinutes(candidate.summary.totalTime)} · 도보 {formatDistance(candidate.summary.totalWalk)}</span><span className="text-[11px] text-neutral-500">환승 {candidate.intelligence?.transferCount ?? 0}회</span></button>)}</div>}
      {route?.intelligence?.warnings.length && !loading ? <div className="mb-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" aria-label="경로 위험 근거">{route.intelligence.warnings.map((warning, index) => <p key={`${warning.kind}-${warning.segmentIndex ?? index}`}><strong>{warning.title}</strong> · {warning.detail}</p>)}</div> : null}
      {route && !loading && (hasUnavailableTransitGeometry || hasUnavailableWalkingGeometry || hasRoadReference) && <div className="mb-3 space-y-1.5 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900" aria-label="지도 경로 표시 안내">{hasUnavailableTransitGeometry && <p><strong>상세 경로 미제공</strong> · 좌표가 없는 대중교통 구간은 승·하차 지점만 표시합니다.</p>}{hasUnavailableWalkingGeometry && <p><strong>상세 도보 경로 미제공</strong> · 직선 연결선 대신 도보 구간의 승·하차 지점만 표시합니다.</p>}{hasRoadReference && <p className="flex items-center gap-2"><span aria-hidden="true" className="inline-block w-8 border-t-[3px] border-dashed border-orange-500" /><span><strong>도로 기반 참고선</strong> · TMAP 차량 도로 geometry</span></p>}</div>}
      {loading && locationStatus !== 'locating' && <div className="flex items-center gap-2 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500"><Navigation className="animate-pulse" size={16} />경로를 찾고 있어요</div>}
      {error && !loading && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><div className="flex gap-2"><AlertCircle className="mt-0.5 shrink-0" size={16} /><div><strong className="block text-xs">이 경로를 표시할 수 없어요</strong><span>{error}</span></div></div><button onClick={() => changeMode(mode === 'walk' ? 'transit' : 'walk')} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm">{mode === 'walk' ? '대중교통 대안 보기' : '도보 대안 보기'}</button></div>}
      {route && !loading && <div className="min-h-0 flex-1 overflow-y-auto pr-1"><div className="flex items-end justify-between border-b border-neutral-100 pb-4"><div><p className="text-xs text-neutral-500">예상 소요 시간</p><strong className="text-2xl text-neutral-900">{formatMinutes(route.summary.totalTime)}</strong></div><span className="text-sm text-neutral-500">{formatDistance(route.summary.totalDistance)}</span></div><ol className="mt-4" aria-label="상세 이동 경로">{route.segments.map((segment, index) => {
        const elapsed = route.segments.slice(0, index).reduce((sum, item) => sum + item.sectionTime, 0);
        const startsAt = new Date(routeDepartureAt + elapsed * 60000);
        const endsAt = new Date(startsAt.getTime() + segment.sectionTime * 60000);
        const isWalk = segment.trafficType === 3;
        const stage = isWalk ? null : transitStage(segment);
        const isFirstTransit = !isWalk && !route.segments.slice(0, index).some((item) => item.trafficType !== 3);
        const isLastTransit = !isWalk && !route.segments.slice(index + 1).some((item) => item.trafficType !== 3);
        const startName = segment.startName || (isFirstTransit ? route.summary.firstStartStation : null);
        const endName = segment.endName || (isLastTransit ? route.summary.lastEndStation : null);
        const isTransfer = segment.transfer || (index > 0 && !isWalk && route.segments[index - 1].trafficType !== 3);
        return <li key={`${segment.label}-${index}`} className="relative flex gap-3 pb-5 last:pb-1">{index < route.segments.length - 1 && <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-neutral-200" />}<span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-white ${segment.trafficType === 1 ? 'bg-emerald-100 text-emerald-700' : segment.trafficType === 2 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>{segment.trafficType === 1 ? <TrainFront size={15} /> : segment.trafficType === 2 ? <Bus size={15} /> : <Footprints size={15} />}</span><div className="min-w-0 flex-1 rounded-xl border border-neutral-100 bg-neutral-50 p-3"><div className="flex items-start justify-between gap-2"><div>{stage && <p className="mb-0.5 text-[10px] font-bold tracking-wide text-blue-600">{stage}</p>}<p className="text-sm font-semibold text-neutral-800">{segment.laneName || segment.label}</p>{isTransfer && <p className="mt-0.5 text-[11px] font-semibold text-blue-600">환승 구간</p>}</div><span className="shrink-0 text-[11px] text-neutral-400">{formatClock(startsAt)}–{formatClock(endsAt)}</span></div>{isWalk ? <><p className="mt-1 text-xs text-neutral-600">도보 {formatDistance(segment.distance)} · {formatSteps(segment.distance)}</p>{segment.distance >= LONG_WALK_WARNING_M && <p className="mt-2 flex gap-1.5 rounded-md bg-amber-100 px-2 py-1.5 text-[11px] font-semibold text-amber-900"><AlertCircle className="mt-0.5 shrink-0" size={12} />장거리 도보 구간입니다. 이동 가능 여부와 대체 교통편을 확인하세요.</p>}</> : <div className="mt-2 space-y-1 text-xs text-neutral-600"><p><strong className="font-semibold text-neutral-700">승차</strong> {startName || '승차 지점 확인 필요'}</p><p><strong className="font-semibold text-neutral-700">하차</strong> {endName || '하차 지점 확인 필요'}</p>{segment.instruction && <p className="pt-1 text-[11px] text-neutral-500">{segment.instruction}</p>}{!hasActualTransitGeometry(segment) && !isRoadReference(segment) && <p className="pt-1 text-[11px] font-semibold text-orange-700">지도 상세 경로 미제공</p>}</div>}<p className="mt-1 flex items-center gap-1 text-[11px] text-neutral-500"><Clock3 size={11} />예상 {formatMinutes(segment.sectionTime)} · {formatDistance(segment.distance)}</p>{segment.congestion !== undefined && segment.congestion !== null && String(segment.congestion).trim() && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">제공된 혼잡 정보: {String(segment.congestion)}</p>}</div></li>;
      })}</ol>{route.summary.payment > 0 && <p className="mt-3 text-right text-xs text-neutral-500">예상 요금 {route.summary.payment.toLocaleString()}원</p>}<section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/70" aria-labelledby="route-comment-title"><button type="button" onClick={() => setCommentOpen((open) => !open)} aria-expanded={commentOpen} aria-controls="route-comment-content" className="flex w-full items-center gap-2 p-3 text-left"><span className="grid size-8 place-items-center rounded-full bg-violet-100 text-violet-700"><Sparkles size={16} /></span><span id="route-comment-title" className="flex-1 text-sm font-bold text-violet-950">AI 경로 코멘트</span>{commentOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{commentOpen && <div id="route-comment-content" className="space-y-3 border-t border-violet-100 p-3" aria-live="polite">{commentLoading && <p className="flex items-center gap-2 text-xs text-violet-700"><Sparkles className="animate-pulse" size={14} />실제 경로를 분석하고 있어요.</p>}{commentError && <p className="flex gap-2 text-xs text-amber-800"><AlertCircle className="shrink-0" size={14} />{commentError}</p>}{routeComment && !commentLoading && <><div><p className="mb-1 text-[11px] font-bold text-violet-800">핵심 요약</p><p className="text-xs leading-5 text-neutral-700">{routeComment.summary}</p></div><div><p className="mb-1 text-[11px] font-bold text-violet-800">주의 구간</p><p className="text-xs leading-5 text-neutral-700">{routeComment.caution}</p></div><div><p className="mb-1 text-[11px] font-bold text-violet-800">지금 할 일</p><ul className="space-y-1 text-xs leading-5 text-neutral-700">{routeComment.actions.map((action, index) => <li key={`${action}-${index}`} className="flex gap-2"><span aria-hidden="true" className="font-bold text-violet-500">{index + 1}.</span><span>{action}</span></li>)}</ul></div><p className="text-[10px] text-neutral-400">{routeComment.source === 'ai' ? 'AI가 경로 데이터와 현재 시각을 바탕으로 작성했어요.' : '경로 데이터 기반 자동 분석이에요.'}</p></>}</div>}</section></div>}
    </aside>
  );

  return <div className="absolute inset-0 z-10 flex flex-col bg-white"><header className="relative z-20 flex items-center justify-between border-b border-neutral-100 px-4 py-3"><div><p className="text-[13px] font-semibold text-neutral-900">{activeRecord.type === 'commute' ? '출근 이동 중' : '퇴근 이동 중'}</p><p className="text-[11px] text-neutral-400">현재 위치와 경로를 실시간으로 확인하세요</p></div><button onClick={onClose} aria-label="지도 닫기" className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"><X size={18} /></button></header><div className="flex min-h-0 flex-1 flex-col md:flex-row"><div className="relative min-h-[45vh] flex-1"><div ref={containerRef} data-map-interactive className="absolute inset-0 touch-none" /><div className="absolute left-3 top-3 z-20 rounded-lg bg-white/90 px-2 py-1 text-[10px] text-neutral-500 shadow"><MapPin className="mr-1 inline" size={11} />파랑 현재 · 검정 출발 · 빨강 도착</div><button type="button" onClick={recenter} disabled={!hasCurrentLocation} className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-lg disabled:cursor-not-allowed disabled:opacity-50"><Crosshair size={15} />내 위치로</button></div>{panel}</div><footer className="relative z-20 flex items-center gap-4 border-t border-neutral-100 bg-white p-4"><p className="flex-1 text-center font-mono text-[20px] font-semibold tabular-nums">{formatElapsed(activeRecord.start_time)}</p><button onClick={arrive} disabled={arriving} className="w-1/2 rounded-[14px] bg-emerald-500 py-3 text-[14px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">{arriving ? '기록 중…' : '도착'}</button></footer></div>;
}
