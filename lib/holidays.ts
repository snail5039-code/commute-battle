import { supabase } from './supabase';
import { attendanceWorkspaceId } from './attendance';

// 공휴일은 세 경로로 들어옵니다. 저장은 셋 다 같은 RPC를 씁니다.
//   public_api — 한국천문연구원 특일 정보 (/api/holidays)
//   csv        — 공공데이터포털 파일데이터 업로드
//   custom     — 창립기념일·단체 연차처럼 회사마다 다른 휴일
// 휴일 여부는 근무시간 집계(get_attendance_summary)가 서버에서 직접 읽습니다.

export type HolidaySource = 'public_api' | 'custom';

export interface WorkHoliday {
  date: string;
  name: string;
  source: HolidaySource;
}

export interface HolidayInput {
  date: string;
  name: string;
}

export const SOURCE_LABEL: Record<HolidaySource, string> = {
  public_api: '공공데이터',
  custom: '직접 추가',
};

function rpcError(cause: { code?: string; message?: string }, fallback: string) {
  if (cause.code === 'PGRST202') return new Error('공휴일 서버 설정(202608170011 마이그레이션)이 아직 적용되지 않았습니다.');
  if (cause.code === '42501') return new Error('권한이 없습니다. 로그인 상태를 확인해 주세요.');
  return new Error(cause.message || fallback);
}

export async function fetchHolidays(workspaceId: string, from: string, to: string): Promise<WorkHoliday[]> {
  const { data, error } = await supabase.rpc('list_work_holidays', {
    target_workspace_id: workspaceId, from_date: from, to_date: to,
  });
  if (error) throw rpcError(error, '공휴일을 불러오지 못했습니다.');
  return (data ?? []) as WorkHoliday[];
}

// overwrite=false면 이미 등록된 날짜는 건드리지 않습니다. 공공데이터를 다시 불러와도
// 관리자가 손본 이름이나 자체 휴일이 덮어써지지 않게 하기 위해서입니다.
export async function saveHolidays(
  workspaceId: string,
  items: HolidayInput[],
  source: HolidaySource,
  overwrite: boolean
): Promise<number> {
  const { data, error } = await supabase.rpc('save_work_holidays', {
    target_workspace_id: workspaceId, items, new_source: source, overwrite,
  });
  if (error) throw rpcError(error, '공휴일을 저장하지 못했습니다.');
  return Number(data ?? 0);
}

export async function deleteHoliday(workspaceId: string, date: string) {
  const { error } = await supabase.rpc('delete_work_holiday', {
    target_workspace_id: workspaceId, target_date: date,
  });
  if (error) throw rpcError(error, '공휴일을 삭제하지 못했습니다.');
}

// 공공데이터포털 특일 정보에서 그 해 전체를 가져옵니다(서버 라우트가 키를 쥐고 있습니다).
export async function fetchPublicHolidays(year: number): Promise<HolidayInput[]> {
  const response = await fetch(`/api/holidays?year=${year}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || '공휴일을 불러오지 못했습니다.');
  return (payload?.holidays ?? []) as HolidayInput[];
}

// ── CSV 업로드 ────────────────────────────────────────────────────────────────
// 공공데이터포털 파일데이터는 기관마다 컬럼 이름이 제각각이라, 헤더 이름에 기대지 않고
// "어느 열이 날짜처럼 생겼는지"를 세어서 고릅니다.

export function parseDateCell(value: string): string | null {
  const text = value.trim().replace(/^["']|["']$/g, '');
  if (!text) return null;
  let year: number, month: number, day: number;

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  const delimited = text.match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})\s*일?$/);
  if (compact) [, year, month, day] = compact.map(Number) as [number, number, number, number];
  else if (delimited) [, year, month, day] = delimited.map(Number) as [number, number, number, number];
  else return null;

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  // 2월 30일 같은 값을 걸러냅니다.
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current); current = '';
    } else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

// 공공데이터 CSV는 EUC-KR인 경우가 많습니다. UTF-8로 먼저 시도하고 실패하면 바꿉니다.
export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

export interface CsvParseResult {
  holidays: HolidayInput[];
  skipped: number;
  columns: { date: number; name: number } | null;
}

export function parseHolidayCsv(text: string): CsvParseResult {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(splitCsvLine);
  if (rows.length < 2) return { holidays: [], skipped: 0, columns: null };

  const width = Math.max(...rows.map((row) => row.length));
  const body = rows.slice(1);

  // 날짜 열 = 값이 날짜로 읽히는 비율이 가장 높은 열
  let dateColumn = -1;
  let bestScore = 0;
  for (let column = 0; column < width; column += 1) {
    const score = body.filter((row) => parseDateCell(row[column] ?? '')).length;
    if (score > bestScore) { bestScore = score; dateColumn = column; }
  }
  if (dateColumn < 0 || bestScore === 0) return { holidays: [], skipped: body.length, columns: null };

  // 이름 열 = 헤더에 '명/이름/휴일'이 들어간 열을 우선, 없으면 날짜가 아닌 글자 열 중 가장 잘 채워진 열
  const header = rows[0].map((cell) => cell.replace(/\s/g, ''));
  let nameColumn = header.findIndex((cell, index) =>
    index !== dateColumn && /(명|이름|휴일|내용|name)/i.test(cell));
  if (nameColumn < 0) {
    let filled = 0;
    for (let column = 0; column < width; column += 1) {
      if (column === dateColumn) continue;
      const count = body.filter((row) => (row[column] ?? '').trim() && !parseDateCell(row[column] ?? '')).length;
      if (count > filled) { filled = count; nameColumn = column; }
    }
  }

  const seen = new Set<string>();
  const holidays: HolidayInput[] = [];
  let skipped = 0;
  for (const row of body) {
    const date = parseDateCell(row[dateColumn] ?? '');
    if (!date || seen.has(date)) { skipped += 1; continue; }
    const name = (nameColumn >= 0 ? (row[nameColumn] ?? '').trim() : '').slice(0, 60) || '공휴일';
    seen.add(date);
    holidays.push({ date, name });
  }
  holidays.sort((a, b) => a.date.localeCompare(b.date));
  return { holidays, skipped, columns: { date: dateColumn, name: nameColumn } };
}

// 대시보드에서 "오늘이 공휴일인가"만 물어볼 때 씁니다. 휴일이어도 출근을 막지는 않습니다 —
// 휴일 근무는 실제로 있고, 그건 휴일근로로 집계되면 될 일입니다. 여기서는 알려주기만 합니다.
export async function fetchHolidayOn(date: string): Promise<WorkHoliday | null> {
  const workspaceId = await attendanceWorkspaceId();
  if (!workspaceId) return null;
  const items = await fetchHolidays(workspaceId, date, date).catch(() => []);
  return items[0] ?? null;
}

// ── 매년 자동 갱신 ────────────────────────────────────────────────────────────
// 관리자가 매년 '공공데이터 불러오기'를 눌러야만 채워지던 것을, 관리자가 앱을 열 때
// 서버가 알아서 채우도록 했습니다(202608180003). 언제 무엇을 당겨올지는 서버가 정합니다 —
// 기기 시계나 localStorage를 믿으면 기기마다 따로 놀고, 시크릿창에서 매번 다시 돕니다.

export interface HolidaySyncRecord {
  year: number;
  attemptedAt: string;
  succeededAt: string | null;
  importedCount: number;
  note: string | null;
}

// 관리자가 아니면 예외가 아니라 빈 배열이 옵니다. 이 함수는 로그인한 모두가 부릅니다.
export async function holidaySyncDue(workspaceId: string): Promise<number[]> {
  const { data, error } = await supabase.rpc('holiday_sync_due', { target_workspace_id: workspaceId });
  if (error) throw rpcError(error, '공휴일 갱신 대상을 확인하지 못했습니다.');
  return ((data ?? []) as number[]).map(Number);
}

export async function recordHolidaySync(
  workspaceId: string, year: number, imported: number, ok: boolean, note?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('record_holiday_sync', {
    target_workspace_id: workspaceId, target_year: year, imported, ok, note: note ?? null,
  });
  if (error) throw rpcError(error, '공휴일 갱신 결과를 기록하지 못했습니다.');
}

export async function listHolidaySyncs(workspaceId: string): Promise<HolidaySyncRecord[]> {
  const { data, error } = await supabase.rpc('list_holiday_syncs', { target_workspace_id: workspaceId });
  if (error) throw rpcError(error, '공휴일 갱신 이력을 불러오지 못했습니다.');
  return (data ?? []) as HolidaySyncRecord[];
}

export interface HolidaySyncOutcome { year: number; imported: number }

// 자리를 맡아 둔 동안 남겨 두는 표시. 관리자 화면이 '실패'와 구분하려고 이 값을 봅니다.
export const RUNNING_NOTE = '가져오는 중';

// 조용히 돕니다. 실패해도 화면에 오류를 띄우지 않습니다 — 사용자가 요청한 적 없는 작업이고,
// 서버가 하루 뒤 다시 시도하게 잡아 둡니다. 무슨 일이 있었는지는 /admin 공휴일 카드에 나옵니다.
export async function syncHolidaysIfDue(workspaceId: string): Promise<HolidaySyncOutcome[]> {
  const years = await holidaySyncDue(workspaceId).catch(() => [] as number[]);
  const done: HolidaySyncOutcome[] = [];

  for (const year of years) {
    // 가져오기 전에 자리를 맡아 둡니다. 여기서 창이 닫혀도 시도 시각이 남아,
    // 다음 접속 때 곧바로 또 두드리지 않습니다. 실패에도 제동이 걸려야 합니다.
    try {
      await recordHolidaySync(workspaceId, year, 0, false, RUNNING_NOTE);
    } catch {
      return done;  // 관리자가 아니거나 서버가 막았습니다. 더 진행할 이유가 없습니다.
    }

    try {
      const fetched = await fetchPublicHolidays(year);
      if (!fetched.length) {
        // 내년 특일 정보는 대개 7월쯤 공개됩니다. 그전까지는 빈 응답이 정상입니다.
        await recordHolidaySync(workspaceId, year, 0, false, `${year}년 공휴일이 아직 공개되지 않았습니다.`);
        continue;
      }
      const saved = await saveHolidays(workspaceId, fetched, 'public_api', false);
      await recordHolidaySync(workspaceId, year, saved, true, null);
      done.push({ year, imported: saved });
    } catch (cause) {
      await recordHolidaySync(
        workspaceId, year, 0, false,
        cause instanceof Error ? cause.message : '공휴일을 불러오지 못했습니다.'
      ).catch(() => {});
    }
  }

  return done;
}
