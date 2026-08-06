import { NextRequest, NextResponse } from 'next/server';
import { analyzeRoute, selectCandidateKeys, type RouteBadge } from '@/lib/routeIntelligence';

const ODSAY_BASE = 'https://api.odsay.com/v1/api';
const TMAP_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
const EARTH_RADIUS_M = 6_371_000;
const WALK_ROUTE_FACTOR = 1.22;
const WALKING_SPEED_KMH = 4.5;
const CONNECTION_GAP_M = 1;
const MAX_TERMINAL_WALK_M = 1_500;

type Provider = 'tmap' | 'odsay';
type ProviderErrorCode = 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'ROUTE_NOT_FOUND';

class ProviderError extends Error {
  constructor(readonly provider: Provider, readonly code: ProviderErrorCode, readonly status: number, message: string) {
    super(message);
  }
}

interface Point { lat: number; lng: number }
interface Segment {
  trafficType: number;
  providerTrafficType?: number | null;
  label: string;
  instruction?: string;
  startName?: string | null;
  endName?: string | null;
  routeName?: string | null;
  stationCount?: number | null;
  transferIndex?: number | null;
  way?: string | null;
  door?: string | null;
  distance: number;
  sectionTime: number;
  points: Point[];
  geometrySource?: 'odsay' | 'tmap-pedestrian' | 'tmap-road-reference' | 'osrm-road-reference' | 'endpoint-connector' | 'unavailable';
  estimatedGeometry?: boolean;
}
interface OdsaySubPath {
  trafficType: number;
  distance?: number;
  sectionTime?: number;
  startName?: string;
  endName?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  stationCount?: number;
  way?: string | number;
  door?: string | number;
  lane?: { busNo?: string; name?: string }[];
  passStopList?: { stationList?: unknown[] };
}
interface OdsayPath { info?: { mapObj?: string; totalTime?: number; totalWalk?: number; payment?: number; firstStartStation?: string; lastEndStation?: string }; subPath?: OdsaySubPath[] }
interface Lane { section?: { graphPos?: { x: number | string; y: number | string }[] }[]; graphPos?: { x: number | string; y: number | string }[] }

const INTERCITY_TYPES = [4, 5, 6];
const LOCAL_TRANSIT_TYPES = [1, 2, 3];

const validPoint = (point: Point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
const compact = (points: Point[]) => points.filter((point, index) => !index || point.lat !== points[index - 1].lat || point.lng !== points[index - 1].lng);

function cleanSecret(value: string | undefined) {
  let cleaned = value?.trim();
  if (!cleaned) return undefined;
  const quote = cleaned[0];
  if (cleaned.length >= 2 && (quote === '"' || quote === "'") && cleaned.at(-1) === quote) cleaned = cleaned.slice(1, -1).trim();
  cleaned = cleaned.replace(/^(?:TMAP_APP_KEY|TMAP_API_KEY|ODSAY_API_KEY)\s*=\s*/i, '').trim();
  return cleaned || undefined;
}

function providerFailure(provider: Provider, response: Response, data: unknown) {
  const body = data as { error?: { message?: string; msg?: string; code?: string | number } | Array<{ message?: string; msg?: string; code?: string | number }>; message?: string; msg?: string; code?: string | number } | null;
  const detail = Array.isArray(body?.error) ? body.error[0] : body?.error;
  const raw = detail?.message || detail?.msg || body?.message || body?.msg || '';
  const code = String(detail?.code ?? body?.code ?? '');
  if (response.status === 401 || response.status === 403 || /ApiKeyAuthFailed|authentication failed|invalid api.?key/i.test(raw)) {
    return new ProviderError(provider, 'PROVIDER_AUTH_FAILED', 401, `${provider.toUpperCase()} 인증에 실패했습니다.`);
  }
  if (response.status === 429) return new ProviderError(provider, 'PROVIDER_RATE_LIMITED', 429, `${provider.toUpperCase()} 요청 한도를 초과했습니다.`);
  if (provider === 'odsay' && (/^-?(?:98|99)$/.test(code) || /route|path|경로.*(?:없|찾)/i.test(raw))) {
    return new ProviderError(provider, 'ROUTE_NOT_FOUND', 404, '대중교통 경로를 찾지 못했습니다.');
  }
  return new ProviderError(provider, 'PROVIDER_UNAVAILABLE', 502, `${provider.toUpperCase()} 경로 서비스를 현재 이용할 수 없습니다.`);
}

function distance(a: Point, b: Point) {
  const rad = (value: number) => value * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function polylineDistance(points: Point[]) {
  return points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0);
}

async function json(url: URL, provider: Provider) {
  const response = await fetch(url, { headers: { Referer: 'https://commute-battle.vercel.app' } });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error || data?.result?.error) throw providerFailure(provider, response, data?.result?.error || data);
  return data;
}

async function odsaySearch(start: Point, end: Point, key: string, searchType: 0 | 1 | 2) {
  const url = new URL(`${ODSAY_BASE}/searchPubTransPathT`);
  Object.entries({ SX: start.lng, SY: start.lat, EX: end.lng, EY: end.lat, searchType, apiKey: key }).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  return json(url, 'odsay');
}

async function odsayPaths(start: Point, end: Point, key: string): Promise<OdsayPath[]> {
  const paths: OdsayPath[] = [];
  let lastError: unknown;
  // ODSAY distinguishes urban, direct intercity, and transfer intercity searches.
  for (const searchType of [2, 1, 0] as const) {
    try {
      const data = await odsaySearch(start, end, key, searchType);
      paths.push(...((data?.result?.path || []) as OdsayPath[]));
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderError && error.code !== 'ROUTE_NOT_FOUND') throw error;
    }
  }
  if (!paths.length && lastError) throw lastError;
  return paths;
}

async function odsayLanes(mapObj: string | undefined, key: string): Promise<Lane[]> {
  if (!mapObj) return [];
  const url = new URL(`${ODSAY_BASE}/loadLane`);
  url.searchParams.set('mapObject', `0:0@${mapObj}`);
  url.searchParams.set('apiKey', key);
  return (await json(url, 'odsay'))?.result?.lane || [];
}

function endpoints(path: OdsaySubPath): Point[] {
  const points = [{ lat: Number(path.startY), lng: Number(path.startX) }, { lat: Number(path.endY), lng: Number(path.endX) }];
  return points.every(validPoint) ? points : [];
}

function lanePoints(lane?: Lane): Point[] {
  const raw = lane?.section?.flatMap((part) => part.graphPos || []) ?? lane?.graphPos ?? [];
  return compact(raw.map((point) => ({ lat: Number(point.y), lng: Number(point.x) })).filter(validPoint));
}

function anchoredLanePoints(path: OdsaySubPath, lane: Point[]) {
  const anchors = endpoints(path);
  if (anchors.length < 2) return lane;
  const [from, to] = anchors;
  if (!lane.length) return anchors;
  const oriented = distance(from, lane.at(-1)!) < distance(from, lane[0]) ? [...lane].reverse() : lane;
  return compact([from, ...oriented, to]);
}

function metric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function fillMissingSegmentPoints(start: Point, end: Point, segments: Segment[]) {
  if (!segments.some((segment) => segment.points.some(validPoint))) throw new Error('경로 좌표를 받지 못했습니다.');
  return segments.map((segment, index) => {
    if (segment.points.length >= 2) return segment;
    let from = index === 0 ? start : segments[index - 1].points.at(-1);
    let to = index === segments.length - 1 ? end : segments[index + 1].points[0];
    for (let cursor = index - 1; !from && cursor >= 0; cursor--) from = segments[cursor].points.at(-1);
    for (let cursor = index + 1; !to && cursor < segments.length; cursor++) to = segments[cursor].points[0];
    return { ...segment, points: compact([from || start, to || end].filter(validPoint)) };
  });
}

function connectionSegment(from: Point, to: Point): Segment {
  const gap = distance(from, to);
  return {
    trafficType: 3,
    providerTrafficType: null,
    label: '도보 연결',
    startName: null,
    endName: null,
    routeName: null,
    stationCount: null,
    transferIndex: null,
    way: null,
    door: null,
    distance: Math.round(gap),
    sectionTime: Math.max(1, Math.round((gap / 1000) / WALKING_SPEED_KMH * 60)),
    points: [from, to],
    geometrySource: 'endpoint-connector',
    estimatedGeometry: true,
  };
}

function unavailableConnection() {
  return new ProviderError('odsay', 'ROUTE_NOT_FOUND', 404, '연결 대중교통 정보 없음');
}

function connectSegmentPoints(start: Point, end: Point, segments: Segment[]) {
  const connected: Segment[] = [];
  let cursor = start;
  for (const segment of segments) {
    const first = segment.points[0];
    if (distance(cursor, first) > CONNECTION_GAP_M) connected.push(connectionSegment(cursor, first));
    connected.push(segment);
    cursor = segment.points.at(-1)!;
  }
  if (distance(cursor, end) > CONNECTION_GAP_M) connected.push(connectionSegment(cursor, end));
  return connected;
}

async function walking(start: Point, end: Point, key: string): Promise<Segment> {
  const direct = distance(start, end);
  const response = await fetch(TMAP_URL, {
    method: 'POST',
    headers: { appKey: key, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ startX: String(start.lng), startY: String(start.lat), endX: String(end.lng), endY: String(end.lat), reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', startName: '출발', endName: '도착', searchOption: '0' }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw providerFailure('tmap', response, data);
  if (!Array.isArray(data?.features)) throw new ProviderError('tmap', 'ROUTE_NOT_FOUND', 404, '도보 경로를 찾지 못했습니다.');
  const points = compact(data.features.flatMap((feature: { geometry?: { type?: string; coordinates?: unknown[] } }) => feature.geometry?.type === 'LineString' ? (feature.geometry.coordinates || []).map((coordinate) => Array.isArray(coordinate) ? { lng: Number(coordinate[0]), lat: Number(coordinate[1]) } : null).filter((point): point is Point => !!point && validPoint(point)) : []));
  const props = data.features.find((feature: { properties?: { totalDistance?: number; totalTime?: number } }) => feature.properties?.totalDistance != null)?.properties;
  if (points.length < 2) throw new ProviderError('tmap', 'ROUTE_NOT_FOUND', 404, '도보 경로 좌표를 받지 못했습니다.');
  return { trafficType: 3, label: '도보', distance: Number(props?.totalDistance || direct), sectionTime: Math.max(1, Math.round(Number(props?.totalTime || 0) / 60)), points, geometrySource: 'tmap-pedestrian', estimatedGeometry: false };
}

async function roadReference(start: Point, end: Point, key: string): Promise<Point[]> {
  const response = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1', {
    method: 'POST',
    headers: { appKey: key, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ startX: String(start.lng), startY: String(start.lat), endX: String(end.lng), endY: String(end.lat), reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '0' }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw providerFailure('tmap', response, data);
  const points = compact((data?.features || []).flatMap((feature: { geometry?: { type?: string; coordinates?: unknown[] } }) => {
    if (feature.geometry?.type !== 'LineString') return [];
    return (feature.geometry.coordinates || []).map((coordinate) => Array.isArray(coordinate) ? { lng: Number(coordinate[0]), lat: Number(coordinate[1]) } : null).filter((point): point is Point => !!point && validPoint(point));
  }));
  if (points.length < 2) throw new ProviderError('tmap', 'ROUTE_NOT_FOUND', 404, '도로 참고선 좌표를 받지 못했습니다.');
  return points;
}

async function osrmRoadReference(start: Point, end: Point): Promise<Point[]> {
  const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinates}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  const response = await fetch(url, { headers: { 'User-Agent': 'commute-battle/1.0' } });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.code !== 'Ok') throw new Error('무료 도로 경로를 불러오지 못했습니다.');
  const points = compact((data?.routes?.[0]?.geometry?.coordinates || [])
    .map((coordinate: unknown) => Array.isArray(coordinate) ? { lng: Number(coordinate[0]), lat: Number(coordinate[1]) } : null)
    .filter((point: Point | null): point is Point => !!point && validPoint(point)));
  if (points.length < 2) throw new Error('무료 도로 경로 좌표가 없습니다.');
  return points;
}

function transitReferenceResponse(start: Point, end: Point, points: Point[], source: 'tmap-road-reference' | 'osrm-road-reference' | 'endpoint-connector') {
  const totalDistance = Math.max(1, Math.round(polylineDistance(points)));
  const totalTime = Math.max(1, Math.round((totalDistance / 1000) / 45 * 60));
  const segment: Segment = {
    trafficType: 2,
    providerTrafficType: 2,
    label: '대중교통 참고 경로',
    instruction: '상세 대중교통 안내를 기준으로 이동해 주세요.',
    distance: totalDistance,
    sectionTime: totalTime,
    points,
    geometrySource: source,
    estimatedGeometry: true,
  };
  return {
    summary: { totalTime, totalDistance, totalWalk: 0, payment: 0, firstStartStation: null, lastEndStation: null, transferCount: 0 },
    segments: [segment],
    polyline: points,
    intelligence: analyzeRoute([segment], []),
    isEstimated: true,
    provider: source === 'tmap-road-reference' ? 'tmap-reference' : source === 'osrm-road-reference' ? 'osrm-reference' : 'direct-reference',
    notice: source === 'endpoint-connector'
      ? '외부 경로 연결이 지연되어 출발지와 도착지를 점선으로 표시합니다.'
      : '상세 구간 일부를 받지 못해 도로를 따라 참고용 점선 경로를 표시합니다.',
  };
}

async function estimatedTransitReference(start: Point, end: Point, key: string) {
  const points = await roadReference(start, end, key);
  return transitReferenceResponse(start, end, points, 'tmap-road-reference');
}

async function estimatedOdsayReference(path: OdsayPath, start: Point, end: Point, odsayKey: string, tmapKey?: string) {
  const rawSegments = await pathSegments(path, odsayKey);
  let connected = connectSegmentPoints(start, end, fillMissingSegmentPoints(start, end, rawSegments));
  connected = await enrichRoadReferenceSegments(connected, tmapKey);
  connected = await enrichWalkingSegments(connected, tmapKey);
  const segments = connected.map((segment) => ({
    ...segment,
    geometrySource: segment.geometrySource || (segment.trafficType === 3 ? 'endpoint-connector' : 'odsay'),
    estimatedGeometry: segment.estimatedGeometry ?? true,
  } satisfies Segment));
  const polyline = compact(segments.flatMap((segment) => segment.points));
  if (polyline.length < 2) throw new Error('표시할 대중교통 경로 좌표가 없습니다.');
  const measuredDistance = Math.max(1, Math.round(polylineDistance(polyline)));
  const totalDistance = Math.max(measuredDistance, metric(path.info?.totalWalk));
  const totalTime = Math.max(1, metric(path.info?.totalTime) || Math.round((totalDistance / 1000) / 35 * 60));
  const totalWalk = segments.filter((segment) => segment.trafficType === 3).reduce((sum, segment) => sum + segment.distance, 0);
  return {
    id: pathKey(path),
    summary: {
      totalTime,
      totalDistance,
      totalWalk,
      payment: metric(path.info?.payment),
      firstStartStation: path.info?.firstStartStation || null,
      lastEndStation: path.info?.lastEndStation || null,
      transferCount: Math.max(0, segments.filter((segment) => segment.trafficType !== 3).length - 1),
    },
    segments,
    polyline,
    intelligence: analyzeRoute(segments, []),
    isEstimated: true,
    provider: 'odsay-reference',
    notice: '상세 구간 일부를 받지 못해 확인된 대중교통 좌표를 점선으로 연결해 표시합니다.',
  };
}

async function enrichRoadReferenceSegments(segments: Segment[], key?: string): Promise<Segment[]> {
  return Promise.all(segments.map(async (segment) => {
    if (segment.trafficType === 3) return segment;
    if (segment.points.length > 2 && !segment.estimatedGeometry) return segment;
    const from = segment.points[0];
    const to = segment.points.at(-1);
    if (!from || !to) return segment;
    if (key) {
      try {
        const points = await roadReference(from, to, key);
        return { ...segment, points, geometrySource: 'tmap-road-reference', estimatedGeometry: true };
      } catch (error) {
        console.warn('TMAP road reference unavailable:', error);
      }
    }
    try {
      const points = await osrmRoadReference(from, to);
      return { ...segment, points, geometrySource: 'osrm-road-reference', estimatedGeometry: true };
    } catch (error) {
      console.warn('OSRM road reference unavailable:', error);
      return segment;
    }
  }));
}

async function enrichWalkingSegments(segments: Segment[], key?: string): Promise<Segment[]> {
  return Promise.all(segments.map(async (segment) => {
    if (segment.trafficType !== 3) return segment;
    if (segment.points.length > 2 && !segment.estimatedGeometry) {
      return { ...segment, geometrySource: segment.geometrySource || 'odsay' };
    }

    const from = segment.points[0];
    const to = segment.points.at(-1);
    if (!from || !to || !key) return { ...segment, geometrySource: 'unavailable', estimatedGeometry: false };

    try {
      const routed = await walking(from, to, key);
      if (routed.points.length <= 2) return { ...segment, geometrySource: 'unavailable', estimatedGeometry: false };
      return { ...segment, distance: routed.distance, sectionTime: routed.sectionTime, points: routed.points, geometrySource: routed.geometrySource, estimatedGeometry: false };
    } catch (error) {
      console.warn('TMAP transit walking connection unavailable:', error);
      return { ...segment, geometrySource: 'unavailable', estimatedGeometry: false };
    }
  }));
}

function validate(start: Point, end: Point, segments: Segment[]) {
  if (!segments.length) throw new Error('표시할 경로 구간이 없습니다.');
  const sanitized = segments.map((segment) => ({ ...segment, distance: metric(segment.distance), sectionTime: metric(segment.sectionTime), points: compact(segment.points.filter(validPoint)) }));
  const cleaned = connectSegmentPoints(start, end, fillMissingSegmentPoints(start, end, sanitized));
  if (cleaned.some((segment) => segment.points.length < 2)) throw new Error('일부 경로 구간의 좌표를 구성하지 못했습니다.');
  const boundaryGap = cleaned.slice(1).reduce((max, segment, index) => Math.max(max, distance(cleaned[index].points.at(-1)!, segment.points[0])), 0);
  if (distance(start, cleaned[0].points[0]) > CONNECTION_GAP_M || boundaryGap > CONNECTION_GAP_M || distance(cleaned.at(-1)!.points.at(-1)!, end) > CONNECTION_GAP_M) {
    throw new Error('경로 구간을 연속적으로 연결하지 못했습니다.');
  }
  const polyline = compact(cleaned.flatMap((segment) => segment.points));
  if (polyline.length < 2) throw new Error('표시할 수 있는 경로 좌표가 없습니다.');
  const direct = distance(start, end);
  const endpointTolerance = Math.max(3_000, direct * 0.4);
  if (distance(start, polyline[0]) > endpointTolerance || distance(end, polyline.at(-1)!) > endpointTolerance) throw new Error('경로 좌표가 요청한 출발지 또는 도착지와 일치하지 않습니다.');
  return { segments: cleaned, polyline };
}

function estimatedWalking(start: Point, end: Point) {
  const estimatedDistance = Math.round(distance(start, end) * WALK_ROUTE_FACTOR);
  const estimatedTime = Math.max(1, Math.round((estimatedDistance / 1000) / WALKING_SPEED_KMH * 60));
  const segment: Segment = { trafficType: 3, label: '참고용 예상 도보 안내', distance: estimatedDistance, sectionTime: estimatedTime, points: [start, end] };
  return {
    summary: { totalTime: estimatedTime, totalDistance: estimatedDistance, totalWalk: estimatedDistance, payment: 0, firstStartStation: null, lastEndStation: null },
    ...validate(start, end, [segment]),
    isEstimated: true,
    provider: 'estimate',
    notice: '참고용 예상 도보 안내입니다. 실제 도로 경로가 아니며, 직선거리에 거리 보정과 평균 보행 속도를 적용했습니다.',
  };
}

async function pathSegments(path: OdsayPath, key: string): Promise<Segment[]> {
  const lanes = await odsayLanes(path.info?.mapObj, key);
  let laneIndex = 0;
  return (path.subPath || []).map((part) => {
    const lane = part.trafficType === 3 ? undefined : lanes[laneIndex++];
    const points = lanePoints(lane);
    const isBus = [2, 5, 6].includes(part.trafficType);
    const isRail = [1, 4].includes(part.trafficType);
    const routeName = part.lane?.map((item) => item.busNo || item.name).find(Boolean) || null;
    const stationCount = Number.isFinite(Number(part.stationCount))
      ? Number(part.stationCount)
      : Array.isArray(part.passStopList?.stationList) ? Math.max(0, part.passStopList.stationList.length - 1) : null;
    const label = isBus
      ? `${part.trafficType === 5 ? '시외버스' : part.trafficType === 6 ? '고속버스' : '버스'}${routeName ? ` ${routeName}` : ''}`
      : isRail ? (routeName || (part.trafficType === 4 ? '기차' : '지하철')) : '도보';
    return {
      trafficType: isBus ? 2 : isRail ? 1 : 3,
      providerTrafficType: part.trafficType,
      label,
      startName: part.startName || null,
      endName: part.endName || null,
      routeName,
      stationCount,
      transferIndex: null,
      way: part.way == null ? null : String(part.way),
      door: part.door == null ? null : String(part.door),
      distance: metric(part.distance),
      sectionTime: metric(part.sectionTime),
      points: anchoredLanePoints(part, points),
      geometrySource: part.trafficType === 3 && points.length > 2 ? 'odsay' : undefined,
      estimatedGeometry: part.trafficType === 3 && points.length <= 2,
    };
  });
}

async function localConnection(start: Point, end: Point, key: string): Promise<Segment[]> {
  if (distance(start, end) <= CONNECTION_GAP_M) return [];
  try {
    const data = await odsaySearch(start, end, key, 0);
    const candidates = (data?.result?.path || []) as OdsayPath[];
    const local = candidates
      .filter((candidate) => candidate.subPath?.some((part) => [1, 2].includes(part.trafficType)))
      .filter((candidate) => candidate.subPath?.every((part) => LOCAL_TRANSIT_TYPES.includes(part.trafficType)))
      .sort((a, b) => metric(a.info?.totalTime) - metric(b.info?.totalTime))[0];
    if (local) return pathSegments(local, key);
  } catch (error) {
    if (error instanceof ProviderError && error.code !== 'ROUTE_NOT_FOUND') throw error;
  }
  if (distance(start, end) <= MAX_TERMINAL_WALK_M) return [connectionSegment(start, end)];
  throw unavailableConnection();
}

function pathKey(path: OdsayPath) {
  return (path.subPath || []).filter((part) => part.trafficType !== 3).map((part) => `${part.trafficType}:${part.lane?.[0]?.busNo || part.lane?.[0]?.name || ''}:${part.startName || ''}:${part.endName || ''}`).join('|');
}

async function buildTransitCandidate(path: OdsayPath, start: Point, end: Point, odsayKey: string, tmapKey: string | undefined, badges: RouteBadge[]) {
  let segments: Segment[];
  const firstIntercity = path.subPath!.findIndex((part) => INTERCITY_TYPES.includes(part.trafficType));
  const lastIntercity = path.subPath!.findLastIndex((part) => INTERCITY_TYPES.includes(part.trafficType));
  if (firstIntercity >= 0 && lastIntercity >= firstIntercity) {
    const firstEndpoints = endpoints(path.subPath![firstIntercity]);
    const lastEndpoints = endpoints(path.subPath![lastIntercity]);
    if (firstEndpoints.length < 2 || lastEndpoints.length < 2) throw unavailableConnection();
    const [access, main, egress] = await Promise.all([
      localConnection(start, firstEndpoints[0], odsayKey),
      pathSegments(path, odsayKey).then((all) => all.slice(firstIntercity, lastIntercity + 1)),
      localConnection(lastEndpoints[1], end, odsayKey),
    ]);
    segments = [...access, ...main, ...egress];
  } else segments = await pathSegments(path, odsayKey);
  segments = connectSegmentPoints(start, end, fillMissingSegmentPoints(start, end, segments));
  segments = await enrichRoadReferenceSegments(segments, tmapKey);
  segments = await enrichWalkingSegments(segments, tmapKey);
  let transitIndex = 0;
  segments.forEach((segment) => { if (segment.trafficType !== 3) segment.transferIndex = transitIndex++; });
  segments.forEach((segment, index) => {
    if (segment.trafficType !== 3) {
      const vehicle = segment.routeName || (segment.providerTrafficType === 4 ? '기차' : segment.providerTrafficType === 5 ? '시외버스' : segment.providerTrafficType === 6 ? '고속버스' : segment.trafficType === 1 ? '지하철' : '버스');
      segment.instruction = `${segment.startName || '승차 지점'}에서 ${vehicle} 승차 → ${segment.endName || '하차 지점'} 하차`;
    } else {
      const previous = segments[index - 1]; const next = segments[index + 1];
      segment.instruction = !previous && next ? `${next.startName || '첫 승차 지점'}까지 도보 이동` : previous && next ? `${previous.endName || '이전 하차 지점'}에서 ${next.startName || '다음 승차 지점'}까지 환승 이동` : previous ? `${previous.endName || '마지막 하차 지점'}에서 목적지까지 도보 이동` : '도보 이동';
    }
  });
  const route = validate(start, end, segments);
  const totalDistance = route.segments.reduce((sum, segment) => sum + segment.distance, 0);
  const totalTime = route.segments.reduce((sum, segment) => sum + segment.sectionTime, 0);
  const totalWalk = route.segments.filter((segment) => segment.trafficType === 3).reduce((sum, segment) => sum + segment.distance, 0);
  if (totalDistance <= 0 || totalTime <= 0) throw new Error('경로 거리 또는 시간이 올바르지 않습니다.');
  return {
    id: pathKey(path),
    summary: { totalTime, totalDistance, totalWalk, payment: metric(path.info?.payment), firstStartStation: path.info?.firstStartStation || route.segments.find((segment) => segment.trafficType !== 3)?.startName || null, lastEndStation: path.info?.lastEndStation || route.segments.findLast((segment) => segment.trafficType !== 3)?.endName || null, transferCount: Math.max(0, transitIndex - 1) },
    ...route,
    intelligence: analyzeRoute(route.segments, badges),
    isEstimated: false,
    provider: 'odsay',
  };
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') === 'walk' ? 'walk' : 'transit';
  const start = { lng: Number(req.nextUrl.searchParams.get('sx')), lat: Number(req.nextUrl.searchParams.get('sy')) };
  const end = { lng: Number(req.nextUrl.searchParams.get('ex')), lat: Number(req.nextUrl.searchParams.get('ey')) };
  if (!validPoint(start) || !validPoint(end)) return NextResponse.json({ error: '출발지와 도착지 좌표가 필요합니다.' }, { status: 400 });
  if (distance(start, end) < 10) return NextResponse.json({ error: '출발지와 도착지가 너무 가깝습니다.' }, { status: 400 });

  const tmapKey = cleanSecret(process.env.TMAP_APP_KEY) || cleanSecret(process.env.TMAP_API_KEY);
  const odsayKey = cleanSecret(process.env.ODSAY_API_KEY);
  if (mode === 'transit' && !odsayKey) return NextResponse.json({ error: '경로 서비스 설정이 완료되지 않았습니다.', code: 'PROVIDER_NOT_CONFIGURED', missing: ['ODSAY_API_KEY'] }, { status: 503 });

  let transitPaths: OdsayPath[] = [];
  try {
    if (mode === 'walk') {
      if (!tmapKey) return NextResponse.json(estimatedWalking(start, end));
      try {
        const segment = await walking(start, end, tmapKey);
        return NextResponse.json({ summary: { totalTime: segment.sectionTime, totalDistance: segment.distance, totalWalk: segment.distance, payment: 0, firstStartStation: null, lastEndStation: null }, ...validate(start, end, [segment]), isEstimated: false, provider: 'tmap' });
      } catch (error) {
        console.warn('TMAP walking route unavailable; returning an estimate:', error);
        return NextResponse.json(estimatedWalking(start, end));
      }
    }

    transitPaths = (await odsayPaths(start, end, odsayKey!)).filter((candidate) => candidate.subPath?.some((part) => [1, 2, 4, 5, 6].includes(part.trafficType)));
    if (!transitPaths.length) throw new ProviderError('odsay', 'ROUTE_NOT_FOUND', 404, '버스 또는 지하철 구간이 포함된 대중교통 경로를 찾지 못했습니다.');
    const selected = selectCandidateKeys(transitPaths.map((path) => ({
      key: pathKey(path),
      totalTime: metric(path.info?.totalTime),
      totalWalk: metric(path.info?.totalWalk),
      transferCount: Math.max(0, (path.subPath || []).filter((part) => part.trafficType !== 3).length - 1),
    })));
    const results = await Promise.allSettled(selected.map(({ key, badges }) => buildTransitCandidate(transitPaths.find((path) => pathKey(path) === key)!, start, end, odsayKey!, tmapKey, badges)));
    const candidates = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (!candidates.length) throw results.find((result) => result.status === 'rejected')?.reason || new Error('경로 후보를 구성하지 못했습니다.');
    return NextResponse.json({ ...candidates[0], candidates });
  } catch (error) {
    console.error('Route lookup failed:', error);
    if (mode === 'transit' && odsayKey && transitPaths.length) {
      try {
        return NextResponse.json(await estimatedOdsayReference(transitPaths[0], start, end, odsayKey, tmapKey));
      } catch (referenceError) {
        console.warn('ODSAY transit reference unavailable:', referenceError);
      }
    }
    if (mode === 'transit' && tmapKey) {
      try {
        return NextResponse.json(await estimatedTransitReference(start, end, tmapKey));
      } catch (referenceError) {
        console.warn('TMAP transit reference unavailable:', referenceError);
      }
    }
    if (mode === 'transit') {
      try {
        const points = await osrmRoadReference(start, end);
        return NextResponse.json(transitReferenceResponse(start, end, points, 'osrm-road-reference'));
      } catch (referenceError) {
        console.warn('OSRM transit reference unavailable:', referenceError);
        return NextResponse.json(transitReferenceResponse(start, end, [start, end], 'endpoint-connector'));
      }
    }
    if (error instanceof ProviderError) return NextResponse.json({ error: error.message, code: error.code, provider: error.provider, fallback: fallback(start, end) }, { status: error.status });
    return NextResponse.json({ error: '대중교통 경로를 찾지 못했습니다.', code: 'ROUTE_LOOKUP_FAILED', fallback: fallback(start, end) }, { status: 502 });
  }
}

function fallback(start: Point, end: Point) {
  const directDistance = Math.round(distance(start, end));
  const destination = `${end.lat},${end.lng}`;
  return {
    type: 'direct-distance',
    directDistance,
    message: '실제 경로가 아닌 출발지와 도착지 사이의 직선거리입니다.',
    kakaoMapUrl: `https://map.kakao.com/link/to/${encodeURIComponent('도착지')},${destination}`,
  };
}
