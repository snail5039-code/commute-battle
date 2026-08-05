import { NextRequest, NextResponse } from 'next/server';

const ODSAY_BASE = 'https://api.odsay.com/v1/api';
const TMAP_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
const EARTH_RADIUS_M = 6_371_000;
const MAX_WALK_REQUEST_METRES = 80_000;

type Provider = 'tmap' | 'odsay';
type ProviderErrorCode = 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'ROUTE_NOT_FOUND';

class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    readonly code: ProviderErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let rejectedTmapKey: string | undefined;
let rejectedOdsayKey: string | undefined;

interface Point { lat: number; lng: number }
interface Segment { trafficType: number; label: string; distance: number; sectionTime: number; points: Point[] }
interface OdsaySubPath { trafficType: number; distance?: number; sectionTime?: number; startX?: number; startY?: number; endX?: number; endY?: number; lane?: { busNo?: string; name?: string }[] }
interface OdsayPath { info?: { mapObj?: string; totalTime?: number; totalWalk?: number; payment?: number; firstStartStation?: string; lastEndStation?: string }; subPath?: OdsaySubPath[] }
interface Lane { section?: { graphPos?: { x: number | string; y: number | string }[] }[]; graphPos?: { x: number | string; y: number | string }[] }

const validPoint = (point: Point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
const compact = (points: Point[]) => points.filter((point, index) => !index || point.lat !== points[index - 1].lat || point.lng !== points[index - 1].lng);

function cleanSecret(value: string | undefined) {
  let cleaned = value?.trim();
  if (!cleaned) return undefined;
  const quote = cleaned[0];
  if (cleaned.length >= 2 && (quote === '"' || quote === "'") && cleaned.at(-1) === quote) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Vercel UI에 실수로 `NAME=value` 전체를 붙여 넣은 경우도 안전하게 복구한다.
  cleaned = cleaned.replace(/^(?:TMAP_APP_KEY|TMAP_API_KEY|ODSAY_API_KEY)\s*=\s*/i, '').trim();
  return cleaned || undefined;
}

function providerFailure(provider: Provider, response: Response, data: unknown) {
  const body = data as { error?: { message?: string } | Array<{ message?: string }>; message?: string } | null;
  const raw = (Array.isArray(body?.error) ? body.error[0]?.message : body?.error?.message || body?.message) || '';
  const authFailed = response.status === 401 || response.status === 403 || /ApiKeyAuthFailed|authentication failed|invalid api.?key/i.test(raw);
  if (authFailed) return new ProviderError(provider, 'PROVIDER_AUTH_FAILED', 401, `${provider.toUpperCase()} 인증에 실패했습니다. 운영 환경의 서버 전용 API 키를 확인해 주세요.`);
  if (response.status === 429) return new ProviderError(provider, 'PROVIDER_RATE_LIMITED', 429, `${provider.toUpperCase()} 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.`);
  return new ProviderError(provider, 'PROVIDER_UNAVAILABLE', 502, `${provider.toUpperCase()} 경로 서비스를 현재 이용할 수 없습니다.`);
}

function distance(a: Point, b: Point) {
  const rad = (value: number) => value * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

async function json(url: URL, provider: Provider) {
  const response = await fetch(url, { headers: { Referer: 'https://commute-battle.vercel.app' } });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) throw providerFailure(provider, response, data);
  return data;
}

async function odsaySearch(start: Point, end: Point, key: string) {
  const url = new URL(`${ODSAY_BASE}/searchPubTransPathT`);
  Object.entries({ SX: start.lng, SY: start.lat, EX: end.lng, EY: end.lat, apiKey: key }).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  return json(url, 'odsay');
}

async function odsayLanes(mapObj: string | undefined, key: string): Promise<Lane[]> {
  if (!mapObj) return [];
  const url = new URL(`${ODSAY_BASE}/loadLane`);
  url.searchParams.set('mapObject', `0:0@${mapObj}`); url.searchParams.set('apiKey', key);
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

async function walking(start: Point, end: Point, key: string): Promise<Segment> {
  const direct = distance(start, end);
  if (direct > MAX_WALK_REQUEST_METRES) throw new Error(`도보로는 약 ${(direct / 1000).toFixed(0)}km 거리입니다. 대중교통 경로를 이용해 주세요.`);
  const response = await fetch(TMAP_URL, { method: 'POST', headers: { appKey: key, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ startX: String(start.lng), startY: String(start.lat), endX: String(end.lng), endY: String(end.lat), reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', startName: '출발', endName: '도착', searchOption: '0' }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw providerFailure('tmap', response, data);
  if (!Array.isArray(data?.features)) throw new ProviderError('tmap', 'ROUTE_NOT_FOUND', 404, '도보 경로를 찾지 못했습니다. 대중교통 경로를 확인해 주세요.');
  const points = compact(data.features.flatMap((feature: { geometry?: { type?: string; coordinates?: unknown[] } }) => feature.geometry?.type === 'LineString' ? (feature.geometry.coordinates || []).map((coordinate) => Array.isArray(coordinate) ? { lng: Number(coordinate[0]), lat: Number(coordinate[1]) } : null).filter((point): point is Point => !!point && validPoint(point)) : []));
  const props = data.features.find((feature: { properties?: { totalDistance?: number; totalTime?: number } }) => feature.properties?.totalDistance != null)?.properties;
  if (points.length < 2) throw new Error('도보 경로 좌표를 받지 못했습니다.');
  return { trafficType: 3, label: '도보', distance: Number(props?.totalDistance || direct), sectionTime: Math.max(1, Math.round(Number(props?.totalTime || 0) / 60)), points };
}

function validate(start: Point, end: Point, segments: Segment[]) {
  const cleaned = segments.map((segment) => ({ ...segment, points: compact(segment.points.filter(validPoint)) })).filter((segment) => segment.points.length >= 2);
  const polyline = compact(cleaned.flatMap((segment) => segment.points));
  if (polyline.length < 2) throw new Error('표시할 수 있는 경로 좌표가 없습니다.');
  const direct = distance(start, end);
  const endpointTolerance = Math.max(3_000, direct * 0.4);
  if (distance(start, polyline[0]) > endpointTolerance || distance(end, polyline.at(-1)!) > endpointTolerance) throw new Error('경로 좌표의 출발지 또는 도착지가 요청과 일치하지 않습니다.');
  return { segments: cleaned, polyline };
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') === 'walk' ? 'walk' : 'transit';
  const start = { lng: Number(req.nextUrl.searchParams.get('sx')), lat: Number(req.nextUrl.searchParams.get('sy')) };
  const end = { lng: Number(req.nextUrl.searchParams.get('ex')), lat: Number(req.nextUrl.searchParams.get('ey')) };
  if (!validPoint(start) || !validPoint(end)) return NextResponse.json({ error: '출발지와 도착지 좌표가 필요합니다.' }, { status: 400 });
  if (distance(start, end) < 10) return NextResponse.json({ error: '출발지와 도착지가 너무 가깝습니다.' }, { status: 400 });
  // Server-only names are intentional: never copy provider secrets into NEXT_PUBLIC_* variables.
  const tmapKey = cleanSecret(process.env.TMAP_APP_KEY) || cleanSecret(process.env.TMAP_API_KEY);
  const odsayKey = cleanSecret(process.env.ODSAY_API_KEY);
  const missing = [mode === 'walk' && !tmapKey && 'TMAP_APP_KEY', mode === 'transit' && !odsayKey && 'ODSAY_API_KEY'].filter(Boolean);
  if (missing.length) return NextResponse.json({ error: '경로 서비스 설정이 완료되지 않았습니다.', code: 'PROVIDER_NOT_CONFIGURED', missing }, { status: 503 });

  const blockedProvider = mode === 'walk' && rejectedTmapKey === tmapKey ? 'TMAP' : mode === 'transit' && rejectedOdsayKey === odsayKey ? 'ODSAY' : null;
  if (blockedProvider) return NextResponse.json({ error: `${blockedProvider} 인증 설정을 확인해 주세요.`, code: 'PROVIDER_AUTH_FAILED', provider: blockedProvider.toLowerCase(), fallback: fallback(start, end) }, { status: 401 });

  try {
    if (mode === 'walk') {
      const segment = await walking(start, end, tmapKey!);
      const route = validate(start, end, [segment]);
      return NextResponse.json({ summary: { totalTime: segment.sectionTime, totalDistance: segment.distance, totalWalk: segment.distance, payment: 0, firstStartStation: null, lastEndStation: null }, ...route });
    }
    const data = await odsaySearch(start, end, odsayKey!);
    const path = data?.result?.path?.[0] as OdsayPath | undefined;
    if (!path?.subPath?.length) throw new Error('이 구간의 대중교통 경로를 찾지 못했습니다. 도보 경로를 확인해 주세요.');
    const lanes = await odsayLanes(path.info?.mapObj, odsayKey!);
    let laneIndex = 0;
    const segments: Segment[] = path.subPath.map((part) => {
      const lane = part.trafficType === 3 ? undefined : lanes[laneIndex++];
      const points = lanePoints(lane);
      const fallback = endpoints(part);
      const label = part.trafficType === 1 ? (part.lane?.[0]?.name || '지하철') : part.trafficType === 2 ? `버스${part.lane?.[0]?.busNo ? ` ${part.lane[0].busNo}` : ''}` : '도보';
      return { trafficType: part.trafficType, label, distance: Number(part.distance || 0), sectionTime: Number(part.sectionTime || 0), points: points.length >= 2 ? points : fallback };
    });
    const route = validate(start, end, segments);
    const totalDistance = route.segments.reduce((sum, segment) => sum + segment.distance, 0);
    return NextResponse.json({ summary: { totalTime: Number(path.info?.totalTime || route.segments.reduce((sum, segment) => sum + segment.sectionTime, 0)), totalDistance, totalWalk: Number(path.info?.totalWalk || 0), payment: Number(path.info?.payment || 0), firstStartStation: path.info?.firstStartStation || null, lastEndStation: path.info?.lastEndStation || null }, ...route });
  } catch (error) {
    console.error('Route lookup failed:', error);
    if (error instanceof ProviderError) {
      if (error.code === 'PROVIDER_AUTH_FAILED') {
        if (error.provider === 'tmap') rejectedTmapKey = tmapKey;
        else rejectedOdsayKey = odsayKey;
      }
      return NextResponse.json({ error: error.message, code: error.code, provider: error.provider, fallback: fallback(start, end) }, { status: error.status });
    }
    return NextResponse.json({ error: mode === 'walk' ? '도보 경로를 찾지 못했습니다.' : '대중교통 경로를 찾지 못했습니다.', code: 'ROUTE_LOOKUP_FAILED', fallback: fallback(start, end) }, { status: 502 });
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
