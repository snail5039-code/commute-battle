import { NextRequest, NextResponse } from 'next/server';

const ODSAY_BASE = 'https://api.odsay.com/v1/api';
const TMAP_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
const EARTH_RADIUS_M = 6_371_000;
const MAX_WALK_REQUEST_METRES = 80_000;

interface Point { lat: number; lng: number }
interface Segment { trafficType: number; label: string; distance: number; sectionTime: number; points: Point[] }
interface OdsaySubPath { trafficType: number; distance?: number; sectionTime?: number; startX?: number; startY?: number; endX?: number; endY?: number; lane?: { busNo?: string; name?: string }[] }
interface OdsayPath { info?: { mapObj?: string; totalTime?: number; totalWalk?: number; payment?: number; firstStartStation?: string; lastEndStation?: string }; subPath?: OdsaySubPath[] }
interface Lane { section?: { graphPos?: { x: number | string; y: number | string }[] }[]; graphPos?: { x: number | string; y: number | string }[] }

const validPoint = (point: Point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
const compact = (points: Point[]) => points.filter((point, index) => !index || point.lat !== points[index - 1].lat || point.lng !== points[index - 1].lng);

function distance(a: Point, b: Point) {
  const rad = (value: number) => value * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

async function json(url: URL) {
  const response = await fetch(url, { headers: { Referer: 'https://commute-battle.vercel.app' } });
  const data = await response.json();
  if (!response.ok || data?.error) throw new Error(data?.error?.[0]?.message || data?.error?.message || '경로 제공자 요청에 실패했습니다.');
  return data;
}

async function odsaySearch(start: Point, end: Point, key: string) {
  const url = new URL(`${ODSAY_BASE}/searchPubTransPathT`);
  Object.entries({ SX: start.lng, SY: start.lat, EX: end.lng, EY: end.lat, apiKey: key }).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  return json(url);
}

async function odsayLanes(mapObj: string | undefined, key: string): Promise<Lane[]> {
  if (!mapObj) return [];
  const url = new URL(`${ODSAY_BASE}/loadLane`);
  url.searchParams.set('mapObject', `0:0@${mapObj}`); url.searchParams.set('apiKey', key);
  return (await json(url))?.result?.lane || [];
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
  const data = await response.json();
  if (!response.ok || !Array.isArray(data?.features)) throw new Error(data?.error?.message || '도보 경로를 찾지 못했습니다. 대중교통 경로를 확인해 주세요.');
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
  const tmapKey = process.env.TMAP_APP_KEY || process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_APP_KEY;
  const odsayKey = process.env.ODSAY_API_KEY || process.env.NEXT_PUBLIC_ODSAY_API_KEY;
  if (!tmapKey || (mode === 'transit' && !odsayKey)) return NextResponse.json({ error: '경로 API 키가 설정되지 않았습니다.', missing: [!tmapKey && 'TMAP_APP_KEY', mode === 'transit' && !odsayKey && 'ODSAY_API_KEY'].filter(Boolean) }, { status: 500 });

  try {
    if (mode === 'walk') {
      const segment = await walking(start, end, tmapKey);
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
    return NextResponse.json({ error: mode === 'walk' ? '도보 경로를 찾지 못했습니다.' : '대중교통 경로를 찾지 못했습니다.', detail: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
