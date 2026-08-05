import { NextRequest, NextResponse } from 'next/server';

const ODSAY_BASE = 'https://api.odsay.com/v1/api';
const ODSAY_REFERER = 'https://commute-battle.vercel.app';

interface OdsayLane {
  busNo?: string;
  name?: string;
}

interface OdsaySubPath {
  trafficType: number;
  distance?: number;
  sectionTime: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  lane?: OdsayLane[];
}

interface OdsayLaneSection {
  graphPos?: OdsayGraphPoint[];
}

interface OdsayLaneEntry {
  section?: OdsayLaneSection[];
  graphPos?: OdsayGraphPoint[];
}

interface OdsayGraphPoint {
  x?: number | string;
  y?: number | string;
}

interface Point {
  lat: number;
  lng: number;
}

function segmentLabel(sp: OdsaySubPath): string {
  if (sp.trafficType === 1) return sp.lane?.[0]?.name || '지하철';
  if (sp.trafficType === 2) return `버스${sp.lane?.[0]?.busNo ? ` ${sp.lane[0].busNo}` : ''}`;
  return '도보';
}

function toPoint(point: OdsayGraphPoint): Point | null {
  const lng = Number(point.x);
  const lat = Number(point.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function compactPoints(points: Point[]): Point[] {
  return points.filter((point, index) => {
    const prev = points[index - 1];
    return !prev || prev.lat !== point.lat || prev.lng !== point.lng;
  });
}

function lanePoints(lane: OdsayLaneEntry | undefined): Point[] | null {
  if (!lane) return null;

  const rawPoints =
    lane.section?.flatMap((section) => section.graphPos || []) ?? lane.graphPos ?? [];
  const points = compactPoints(rawPoints.map(toPoint).filter((point): point is Point => !!point));

  return points.length >= 2 ? points : null;
}

function endpointPoints(sp: OdsaySubPath): Point[] | null {
  if (
    typeof sp.startY !== 'number' ||
    typeof sp.startX !== 'number' ||
    typeof sp.endY !== 'number' ||
    typeof sp.endX !== 'number'
  ) {
    return null;
  }

  return [
    { lat: sp.startY, lng: sp.startX },
    { lat: sp.endY, lng: sp.endX },
  ];
}

export async function GET(req: NextRequest) {
  const sx = req.nextUrl.searchParams.get('sx');
  const sy = req.nextUrl.searchParams.get('sy');
  const ex = req.nextUrl.searchParams.get('ex');
  const ey = req.nextUrl.searchParams.get('ey');

  if (!sx || !sy || !ex || !ey) {
    return NextResponse.json({ error: '출발지/도착지 좌표가 필요합니다.' }, { status: 400 });
  }

  const apiKey = process.env.ODSAY_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'ODsay API 키가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    const searchUrl = new URL(`${ODSAY_BASE}/searchPubTransPathT`);
    searchUrl.searchParams.set('SX', sx);
    searchUrl.searchParams.set('SY', sy);
    searchUrl.searchParams.set('EX', ex);
    searchUrl.searchParams.set('EY', ey);
    searchUrl.searchParams.set('apiKey', apiKey);

    const searchRes = await fetch(searchUrl, {
      headers: { Referer: ODSAY_REFERER },
    });
    const searchData = await searchRes.json();

    if (!searchRes.ok || searchData?.error) {
      return NextResponse.json(
        {
          error: 'ODsay 경로 조회 요청이 실패했습니다.',
          detail: searchData?.error ?? null,
          status: searchRes.status,
        },
        { status: searchRes.ok ? 502 : searchRes.status }
      );
    }

    const path = searchData?.result?.path?.[0];
    if (!path) {
      return NextResponse.json(
        { error: 'ODsay에서 경로를 찾지 못했습니다.', detail: searchData?.error ?? null },
        { status: 404 }
      );
    }

    const subPath: OdsaySubPath[] = path.subPath || [];
    const hasTransitSegment = subPath.some((sp) => sp.trafficType === 1 || sp.trafficType === 2);

    if (!hasTransitSegment) {
      return NextResponse.json(
        {
          error: 'ODsay가 도보 경로만 반환했습니다.',
          detail: 'ODsay loadLane은 버스·지하철 구간 좌표만 제공하며 도보 도로 좌표는 제공하지 않습니다.',
        },
        { status: 422 }
      );
    }
    const mapObj: string | undefined = path.info?.mapObj;
    let lanes: OdsayLaneEntry[] = [];

    if (mapObj) {
      const laneUrl = new URL(`${ODSAY_BASE}/loadLane`);
      laneUrl.searchParams.set('mapObject', `0:0@${mapObj}`);
      laneUrl.searchParams.set('apiKey', apiKey);

      const laneRes = await fetch(laneUrl, {
        headers: { Referer: ODSAY_REFERER },
      });
      const laneData = await laneRes.json();

      if (!laneRes.ok || laneData?.error) {
        return NextResponse.json(
          {
            error: 'ODsay 상세 경로 좌표 요청이 실패했습니다.',
            detail: laneData?.error ?? null,
            status: laneRes.status,
          },
          { status: laneRes.ok ? 502 : laneRes.status }
        );
      }

      lanes = laneData?.result?.lane || [];
    }

    let laneIndex = 0;
    const transitPoints: (Point[] | null)[] = subPath.map((sp) => {
      if (sp.trafficType === 3) return null;

      const points = lanePoints(lanes[laneIndex]) ?? endpointPoints(sp);
      laneIndex += 1;
      return points;
    });

    const segments = subPath.map((sp, index) => {
      return {
        trafficType: sp.trafficType,
        label: segmentLabel(sp),
        distance: sp.distance ?? 0,
        sectionTime: sp.sectionTime,
        points: transitPoints[index] ?? [],
      };
    });

    const polyline = compactPoints(segments.flatMap((segment) => segment.points));

    return NextResponse.json({
      summary: {
        totalTime: path.info?.totalTime ?? null,
        totalWalk: path.info?.totalWalk ?? null,
        payment: path.info?.payment ?? null,
        firstStartStation: path.info?.firstStartStation ?? null,
        lastEndStation: path.info?.lastEndStation ?? null,
      },
      segments,
      polyline,
      debug: {
        mapObj: Boolean(mapObj),
        subPathCount: subPath.length,
        laneCount: lanes.length,
        polylinePointCount: polyline.length,
      },
    });
  } catch (error) {
    console.error('Error fetching ODsay transit route:', error);
    return NextResponse.json(
      {
        error: 'ODsay 경로 조회에 실패했습니다.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
