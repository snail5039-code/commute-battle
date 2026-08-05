import { NextRequest, NextResponse } from 'next/server';

const ODSAY_BASE = 'https://api.odsay.com/v1/api';
const ODSAY_REFERER = 'https://commute-battle.vercel.app';
const TMAP_PEDESTRIAN_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
const EARTH_RADIUS_M = 6371000;
const MAX_ROUTE_MINUTES = 24 * 60;

interface Point {
  lat: number;
  lng: number;
}

interface RouteSegment {
  trafficType: number;
  label: string;
  distance: number;
  sectionTime: number;
  points: Point[];
}

interface OdsaySubPath {
  trafficType: number;
  trainType?: number;
  distance?: number;
  sectionTime: number;
  payment?: number;
  startName?: string;
  endName?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  lane?: { busNo?: string; name?: string }[];
}

interface OdsayPath {
  pathType: number;
  info: {
    mapObj?: string;
    totalTime?: number;
    totalWalk?: number;
    payment?: number;
    totalPayment?: number;
    firstStartStation?: string;
    lastEndStation?: string;
  };
  subPath?: OdsaySubPath[];
}

interface OdsayLaneEntry {
  section?: { graphPos?: { x: number | string; y: number | string }[] }[];
  graphPos?: { x: number | string; y: number | string }[];
}

interface BuiltRoute {
  segments: RouteSegment[];
  totalTime: number;
  totalWalk: number;
  payment: number;
  firstStartStation: string | null;
  lastEndStation: string | null;
  laneCount: number;
}

function compactPoints(points: Point[]): Point[] {
  return points.filter((point, index) => {
    const prev = points[index - 1];
    return !prev || prev.lat !== point.lat || prev.lng !== point.lng;
  });
}

function isValidPoint(point: Point): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
}

function distanceMeters(a: Point, b: Point): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function validateRoute(start: Point, end: Point, route: BuiltRoute): RouteSegment[] {
  if (!Number.isFinite(route.totalTime) || route.totalTime <= 0 || route.totalTime > MAX_ROUTE_MINUTES) {
    throw new Error('현실적인 이동 시간 범위를 벗어난 경로입니다.');
  }
  const segments = route.segments
    .map((segment) => ({ ...segment, points: compactPoints(segment.points.filter(isValidPoint)) }))
    .filter((segment) => segment.points.length >= 2);
  const polyline = compactPoints(segments.flatMap((segment) => segment.points));
  if (polyline.length < 2) throw new Error('표시할 수 있는 경로 좌표가 없습니다.');

  const directDistance = distanceMeters(start, end);
  const maxEndpointGap = Math.max(3000, directDistance * 0.35);
  if (distanceMeters(start, polyline[0]) > maxEndpointGap ||
      distanceMeters(end, polyline.at(-1)!) > maxEndpointGap) {
    throw new Error('경로 좌표가 출발지 또는 도착지와 일치하지 않습니다.');
  }
  if (polyline.some((point, index) => index > 0 &&
      distanceMeters(polyline[index - 1], point) > Math.max(100000, directDistance * 2))) {
    throw new Error('경로 좌표 사이에 비정상적인 구간이 있습니다.');
  }
  return segments;
}

function endpointPoints(subPath: OdsaySubPath): Point[] | null {
  if (
    typeof subPath.startX !== 'number' ||
    typeof subPath.startY !== 'number' ||
    typeof subPath.endX !== 'number' ||
    typeof subPath.endY !== 'number'
  ) {
    return null;
  }

  return [
    { lat: subPath.startY, lng: subPath.startX },
    { lat: subPath.endY, lng: subPath.endX },
  ];
}

function lanePoints(lane: OdsayLaneEntry | undefined): Point[] | null {
  const rawPoints = lane?.section?.flatMap((section) => section.graphPos || []) ?? lane?.graphPos ?? [];
  const points = compactPoints(
    rawPoints
      .map((point) => ({ lat: Number(point.y), lng: Number(point.x) }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
  );

  return points.length >= 2 ? points : null;
}

function segmentLabel(subPath: OdsaySubPath): string {
  if (subPath.trafficType === 1) return subPath.lane?.[0]?.name || '지하철';
  if (subPath.trafficType === 2) {
    return `버스${subPath.lane?.[0]?.busNo ? ` ${subPath.lane[0].busNo}` : ''}`;
  }
  return '도보';
}

async function fetchJson(url: URL) {
  const response = await fetch(url, { headers: { Referer: ODSAY_REFERER } });
  const data = await response.json();
  if (!response.ok || data?.error) {
    const message = data?.error?.[0]?.message || data?.error?.message || 'ODsay 요청 실패';
    throw new Error(message);
  }
  return data;
}

async function searchOdsay(start: Point, end: Point, apiKey: string) {
  const url = new URL(`${ODSAY_BASE}/searchPubTransPathT`);
  url.searchParams.set('SX', String(start.lng));
  url.searchParams.set('SY', String(start.lat));
  url.searchParams.set('EX', String(end.lng));
  url.searchParams.set('EY', String(end.lat));
  url.searchParams.set('apiKey', apiKey);
  return fetchJson(url);
}

async function loadOdsayLanes(mapObj: string | undefined, apiKey: string) {
  if (!mapObj) return [] as OdsayLaneEntry[];

  const url = new URL(`${ODSAY_BASE}/loadLane`);
  url.searchParams.set('mapObject', `0:0@${mapObj}`);
  url.searchParams.set('apiKey', apiKey);
  const data = await fetchJson(url);
  return (data?.result?.lane || []) as OdsayLaneEntry[];
}

async function fetchWalkingRoute(start: Point, end: Point, appKey: string): Promise<RouteSegment> {
  const response = await fetch(TMAP_PEDESTRIAN_URL, {
    method: 'POST',
    headers: {
      appKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startX: String(start.lng),
      startY: String(start.lat),
      endX: String(end.lng),
      endY: String(end.lat),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      startName: '출발',
      endName: '도착',
      searchOption: '0',
    }),
  });

  const data = await response.json();
  if (!response.ok || !Array.isArray(data?.features)) {
    throw new Error(data?.error?.message || 'TMAP 보행자 경로 조회 실패');
  }

  const points = compactPoints(
    data.features.flatMap((feature: { geometry?: { type?: string; coordinates?: unknown[] } }) => {
      if (feature.geometry?.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates)) {
        return [];
      }
      return feature.geometry.coordinates
        .map((coordinate) => {
          if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
          return { lng: Number(coordinate[0]), lat: Number(coordinate[1]) };
        })
        .filter((point): point is Point => !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
    })
  );

  const properties = data.features.find(
    (feature: { properties?: { totalDistance?: number; totalTime?: number } }) =>
      feature.properties?.totalDistance != null
  )?.properties;

  if (points.length < 2) throw new Error('TMAP 보행자 경로 좌표 없음');

  return {
    trafficType: 3,
    label: '도보',
    distance: Number(properties?.totalDistance || 0),
    sectionTime: Math.max(1, Math.round(Number(properties?.totalTime || 0) / 60)),
    points,
  };
}

async function buildCityRoute(
  start: Point,
  end: Point,
  path: OdsayPath,
  odsayKey: string,
  tmapKey: string
): Promise<BuiltRoute> {
  const subPaths = path.subPath || [];
  const lanes = await loadOdsayLanes(path.info?.mapObj, odsayKey);
  let laneIndex = 0;
  const transitPoints = subPaths.map((subPath) => {
    if (subPath.trafficType === 3) return null;
    const points = lanePoints(lanes[laneIndex]) ?? endpointPoints(subPath);
    laneIndex += 1;
    return points;
  });

  const segments = await Promise.all(
    subPaths.map(async (subPath, index): Promise<RouteSegment> => {
      if (subPath.trafficType !== 3) {
        return {
          trafficType: subPath.trafficType,
          label: segmentLabel(subPath),
          distance: subPath.distance ?? 0,
          sectionTime: subPath.sectionTime,
          points: transitPoints[index] ?? [],
        };
      }

      const prevPoints = index > 0 ? transitPoints[index - 1] : null;
      const nextPoints = index < subPaths.length - 1 ? transitPoints[index + 1] : null;
      const walkStart = prevPoints?.at(-1) ?? start;
      const walkEnd = nextPoints?.[0] ?? end;
      return fetchWalkingRoute(walkStart, walkEnd, tmapKey);
    })
  );

  return {
    segments,
    totalTime: path.info?.totalTime ?? segments.reduce((sum, segment) => sum + segment.sectionTime, 0),
    totalWalk: path.info?.totalWalk ?? 0,
    payment: path.info?.payment ?? 0,
    firstStartStation: path.info?.firstStartStation ?? null,
    lastEndStation: path.info?.lastEndStation ?? null,
    laneCount: lanes.length,
  };
}

async function buildLocalAccess(
  start: Point,
  end: Point,
  odsayKey: string,
  tmapKey: string
): Promise<BuiltRoute> {
  try {
    const data = await searchOdsay(start, end, odsayKey);
    if (data?.result?.searchType === 0 && data?.result?.path?.[0]) {
      return buildCityRoute(start, end, data.result.path[0], odsayKey, tmapKey);
    }
  } catch {
    // Nearby points and areas without transit are handled by TMAP walking.
  }

  const walking = await fetchWalkingRoute(start, end, tmapKey);
  return {
    segments: [walking],
    totalTime: walking.sectionTime,
    totalWalk: walking.distance,
    payment: 0,
    firstStartStation: null,
    lastEndStation: null,
    laneCount: 0,
  };
}

function intercityLabel(path: OdsayPath, subPath: OdsaySubPath) {
  if (path.pathType === 11) {
    const trainName = subPath.trainType === 8 ? 'SRT' : subPath.trainType === 1 ? 'KTX' : '기차';
    return `${trainName} ${subPath.startName || ''} → ${subPath.endName || ''}`.trim();
  }
  return `고속·시외버스 ${subPath.startName || ''} → ${subPath.endName || ''}`.trim();
}

async function buildIntercityRoute(
  start: Point,
  end: Point,
  path: OdsayPath,
  odsayKey: string,
  tmapKey: string
): Promise<BuiltRoute> {
  const intercity = path.subPath?.[0];
  const stationPoints = intercity ? endpointPoints(intercity) : null;
  if (!intercity || !stationPoints) throw new Error('도시 간 승하차 지점 좌표 없음');

  const [stationStart, stationEnd] = stationPoints;
  const [access, egress] = await Promise.all([
    buildLocalAccess(start, stationStart, odsayKey, tmapKey),
    buildLocalAccess(stationEnd, end, odsayKey, tmapKey),
  ]);

  const mainSegment: RouteSegment = {
    trafficType: path.pathType === 11 ? 1 : 2,
    label: intercityLabel(path, intercity),
    distance: intercity.distance ?? 0,
    sectionTime: intercity.sectionTime,
    points: stationPoints,
  };

  return {
    segments: [...access.segments, mainSegment, ...egress.segments],
    totalTime: access.totalTime + intercity.sectionTime + egress.totalTime,
    totalWalk: access.totalWalk + egress.totalWalk,
    payment: intercity.payment ?? path.info?.totalPayment ?? 0,
    firstStartStation: intercity.startName ?? path.info?.firstStartStation ?? null,
    lastEndStation: intercity.endName ?? path.info?.lastEndStation ?? null,
    laneCount: access.laneCount + egress.laneCount,
  };
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') === 'walk' ? 'walk' : 'transit';
  const start = {
    lng: Number(req.nextUrl.searchParams.get('sx')),
    lat: Number(req.nextUrl.searchParams.get('sy')),
  };
  const end = {
    lng: Number(req.nextUrl.searchParams.get('ex')),
    lat: Number(req.nextUrl.searchParams.get('ey')),
  };

  if (!isValidPoint(start) || !isValidPoint(end)) {
    return NextResponse.json({ error: '출발지/도착지 좌표가 필요합니다.' }, { status: 400 });
  }
  if (distanceMeters(start, end) < 10) {
    return NextResponse.json({ error: '출발지와 도착지가 너무 가깝습니다.' }, { status: 400 });
  }

  const odsayKey = process.env.ODSAY_API_KEY || process.env.NEXT_PUBLIC_ODSAY_API_KEY;
  const tmapKey =
    process.env.TMAP_APP_KEY ||
    process.env.TMAP_API_KEY ||
    process.env.NEXT_PUBLIC_TMAP_APP_KEY;
  if (!tmapKey || (mode === 'transit' && !odsayKey)) {
    return NextResponse.json(
      {
        error: 'ODsay 또는 TMAP API 키가 설정되지 않았습니다.',
        missing: [!odsayKey && 'ODSAY_API_KEY', !tmapKey && 'TMAP_APP_KEY'].filter(Boolean),
      },
      { status: 500 }
    );
  }

  try {
    if (mode === 'walk') {
      const walking = await fetchWalkingRoute(start, end, tmapKey);
      const walkingRoute: BuiltRoute = {
        segments: [walking], totalTime: walking.sectionTime, totalWalk: walking.distance,
        payment: 0, firstStartStation: null, lastEndStation: null, laneCount: 0,
      };
      const segments = validateRoute(start, end, walkingRoute);
      const polyline = compactPoints(segments.flatMap((segment) => segment.points));
      return NextResponse.json({
        summary: {
          totalTime: walking.sectionTime,
          totalWalk: walking.distance,
          payment: 0,
          firstStartStation: null,
          lastEndStation: null,
        },
        segments,
        polyline,
        debug: {
          provider: 'TMAP',
          subPathCount: 1,
          laneCount: 0,
          polylinePointCount: polyline.length,
        },
      });
    }

    if (!odsayKey) throw new Error('ODsay API 키가 설정되지 않았습니다.');

    let route: BuiltRoute;
    try {
      const data = await searchOdsay(start, end, odsayKey);
      const path = data?.result?.path?.[0] as OdsayPath | undefined;
      if (!path) throw new Error('ODsay 경로 없음');

      route = data.result.searchType === 1
        ? await buildIntercityRoute(start, end, path, odsayKey, tmapKey)
        : await buildCityRoute(start, end, path, odsayKey, tmapKey);
    } catch {
      route = await buildLocalAccess(start, end, odsayKey, tmapKey);
    }

    const segments = validateRoute(start, end, route);
    const polyline = compactPoints(segments.flatMap((segment) => segment.points));
    if (polyline.length < 2) throw new Error('표시할 경로 좌표가 없습니다.');

    return NextResponse.json({
      summary: {
        totalTime: route.totalTime,
        totalWalk: route.totalWalk,
        payment: route.payment,
        firstStartStation: route.firstStartStation,
        lastEndStation: route.lastEndStation,
      },
      segments,
      polyline,
      debug: {
        provider: 'ODsay+TMAP',
        subPathCount: segments.length,
        laneCount: route.laneCount,
        polylinePointCount: polyline.length,
      },
    });
  } catch (error) {
    console.error('Hybrid route lookup failed:', error);
    return NextResponse.json(
      {
        error: '경로 조회에 실패했습니다.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
