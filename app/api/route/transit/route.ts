import { NextRequest, NextResponse } from 'next/server';

const ODSAY_BASE = 'https://api.odsay.com/v1/api';
const ODSAY_REFERER = 'https://commute-battle.vercel.app';

interface OdsayLane {
  busNo?: string;
}

interface OdsaySubPath {
  trafficType: number;
  distance?: number;
  sectionTime: number;
  startName?: string;
  endName?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  lane?: OdsayLane[];
}

interface OdsayLaneSection {
  graphPos?: { x: number; y: number }[];
}

interface OdsayLaneEntry {
  section?: OdsayLaneSection[];
}

function segmentLabel(sp: OdsaySubPath): string {
  if (sp.trafficType === 1) return '지하철';
  if (sp.trafficType === 2) return `버스${sp.lane?.[0]?.busNo ? ` ${sp.lane[0].busNo}` : ''}`;
  return '도보';
}

export async function GET(req: NextRequest) {
  const sx = req.nextUrl.searchParams.get('sx');
  const sy = req.nextUrl.searchParams.get('sy');
  const ex = req.nextUrl.searchParams.get('ex');
  const ey = req.nextUrl.searchParams.get('ey');

  if (!sx || !sy || !ex || !ey) {
    return NextResponse.json({ error: '출발지/도착지 좌표가 필요합니다' }, { status: 400 });
  }

  const apiKey = process.env.ODSAY_API_KEY!;

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

    const path = searchData?.result?.path?.[0];
    if (!path) {
      return NextResponse.json({ error: '경로를 찾을 수 없습니다' }, { status: 404 });
    }

    const subPath: OdsaySubPath[] = path.subPath || [];
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
      lanes = laneData?.result?.lane || [];
    }

    // 도보 구간은 좌표가 응답에 없어서(trafficType 3), 우선 환승 구간의 좌표만 채운다
    let laneIndex = 0;
    const transitPoints: ({ lat: number; lng: number }[] | null)[] = subPath.map((sp) => {
      if (sp.trafficType === 3) return null;

      const lane = lanes[laneIndex];
      laneIndex += 1;
      const graphPos = lane?.section?.flatMap((s) => s.graphPos || []) || [];
      if (graphPos.length > 1) {
        return graphPos.map((p) => ({ lat: p.y, lng: p.x }));
      }
      return [
        { lat: sp.startY!, lng: sp.startX! },
        { lat: sp.endY!, lng: sp.endX! },
      ];
    });

    const origin = { lat: Number(sy), lng: Number(sx) };
    const destination = { lat: Number(ey), lng: Number(ex) };

    const segments = subPath.map((sp, i) => {
      let points = transitPoints[i];

      if (!points) {
        const prevPoints = i > 0 ? transitPoints[i - 1] : null;
        const nextPoints = i < subPath.length - 1 ? transitPoints[i + 1] : null;
        const start = prevPoints ? prevPoints[prevPoints.length - 1] : origin;
        const end = nextPoints ? nextPoints[0] : destination;
        points = [start, end];
      }

      return {
        trafficType: sp.trafficType,
        label: segmentLabel(sp),
        distance: sp.distance ?? 0,
        sectionTime: sp.sectionTime,
        points,
      };
    });

    const polyline = segments.flatMap((s) => s.points);

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
    });
  } catch (error) {
    console.error('Error fetching transit route:', error);
    return NextResponse.json({ error: '경로 조회에 실패했습니다' }, { status: 500 });
  }
}
