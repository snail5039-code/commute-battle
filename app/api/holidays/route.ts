import { NextRequest, NextResponse } from 'next/server';

// 공휴일은 한국천문연구원 특일 정보(공공데이터포털)에서 가져옵니다.
// 음력 휴일(설날·추석·부처님오신날)과 대체공휴일, 임시공휴일(선거일 등)이 모두 여기서 옵니다.
// 코드에 날짜를 박아 넣지 않는 이유: 해마다 바뀌고, 틀리면 그대로 임금 계산에 들어갑니다.
//
// 키는 서버에만 둡니다(NEXT_PUBLIC_ 접두사 없음). 브라우저는 이 라우트만 호출합니다.

const ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';
const CACHE_MS = 12 * 60 * 60 * 1000;  // 공휴일은 거의 안 바뀌므로 길게 잡습니다.
const cache = new Map<number, { expiresAt: number; holidays: Holiday[] }>();

export interface Holiday {
  date: string;   // YYYY-MM-DD
  name: string;   // 예: 설날, 대체공휴일(광복절)
}

interface RestDeItem {
  locdate?: number | string;
  dateName?: string;
  isHoliday?: string;
}

function toIsoDate(locdate: number | string | undefined) {
  const text = String(locdate ?? '');
  if (!/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

export async function GET(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get('year'));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: '조회할 연도를 알려주세요.' }, { status: 400 });
  }

  const serviceKey = process.env.DATA_GO_KR_API_KEY;
  if (!serviceKey) {
    return NextResponse.json({
      error: '공휴일 API 키(DATA_GO_KR_API_KEY)가 설정되지 않았습니다. CSV 업로드나 직접 추가를 이용해 주세요.',
    }, { status: 503 });
  }

  const cached = cache.get(year);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ year, holidays: cached.holidays, cached: true });
  }

  // solMonth를 빼면 그 해 전체가 한 번에 옵니다(월별로 12번 호출할 필요 없음).
  const params = new URLSearchParams({
    serviceKey, solYear: String(year), numOfRows: '100', _type: 'json',
  });

  try {
    const response = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`특일정보 ${response.status}`);

    // 키가 틀리면 200과 함께 XML 오류를 돌려주기도 해서, JSON 파싱 실패를 따로 다룹니다.
    const text = await response.text();
    let payload: { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: RestDeItem | RestDeItem[] } } } };
    try {
      payload = JSON.parse(text);
    } catch {
      const reason = text.match(/<returnAuthMsg>([^<]+)</)?.[1] ?? text.match(/<errMsg>([^<]+)</)?.[1];
      throw new Error(reason ? `특일정보 응답 오류: ${reason}` : '특일정보 응답을 해석하지 못했습니다.');
    }

    const header = payload.response?.header;
    if (header?.resultCode && header.resultCode !== '00') {
      throw new Error(`특일정보 오류(${header.resultCode}): ${header.resultMsg ?? '알 수 없음'}`);
    }

    // 항목이 하나면 배열이 아니라 객체로 옵니다.
    const raw = payload.response?.body?.items?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const seen = new Set<string>();
    const holidays: Holiday[] = [];
    for (const item of items) {
      if (item.isHoliday && item.isHoliday !== 'Y') continue;
      const date = toIsoDate(item.locdate);
      const name = String(item.dateName ?? '').trim();
      if (!date || !name || seen.has(date)) continue;
      seen.add(date);
      holidays.push({ date, name });
    }
    holidays.sort((a, b) => a.date.localeCompare(b.date));

    cache.set(year, { expiresAt: Date.now() + CACHE_MS, holidays });
    return NextResponse.json({ year, holidays, cached: false });
  } catch (error) {
    console.error('Holiday lookup failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '공휴일을 불러오지 못했습니다.',
    }, { status: 502 });
  }
}
