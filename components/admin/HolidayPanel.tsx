'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CloudDownload, LoaderCircle, Plus, Trash2, Upload } from 'lucide-react';
import {
  deleteHoliday, decodeCsv, fetchHolidays, fetchPublicHolidays, listHolidaySyncs, parseHolidayCsv,
  RUNNING_NOTE, saveHolidays, SOURCE_LABEL, type HolidaySyncRecord, type WorkHoliday,
} from '@/lib/holidays';

// 휴일은 토·일에 더해 여기 등록된 날짜입니다. 휴일에 근무하면 휴일근로로 잡히고
// 지각·조기퇴근은 따지지 않습니다(get_attendance_summary).

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function weekdayOf(date: string) {
  return WEEKDAY[new Date(`${date}T12:00:00+09:00`).getDay()];
}

export default function HolidayPanel({ workspaceId, year, onChanged }: {
  workspaceId: string;
  year: number;
  onChanged?: () => void;
}) {
  const [target, setTarget] = useState(year);
  const [items, setItems] = useState<WorkHoliday[]>([]);
  const [syncs, setSyncs] = useState<HolidaySyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftName, setDraftName] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const range = useMemo(() => ({ from: `${target}-01-01`, to: `${target}-12-31` }), [target]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setItems(await fetchHolidays(workspaceId, range.from, range.to));
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : '공휴일을 불러오지 못했습니다.');
    } finally { setLoading(false); }
    // 자동 갱신 이력은 없어도 화면이 굴러가야 하므로 실패해도 조용히 넘깁니다.
    setSyncs(await listHolidaySyncs(workspaceId).catch(() => []));
  }, [workspaceId, range.from, range.to]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  const finish = async (message: string) => {
    setNotice(message);
    await load();
    onChanged?.();
  };

  // 공공데이터를 다시 불러와도 이미 등록된 날짜는 건드리지 않습니다(직접 손본 이름·자체 휴일 보호).
  const importFromApi = async () => {
    setBusy('api'); setError(''); setNotice('');
    try {
      const fetched = await fetchPublicHolidays(target);
      if (!fetched.length) { setNotice(`${target}년 공휴일이 아직 공개되지 않았습니다.`); return; }
      const saved = await saveHolidays(workspaceId, fetched, 'public_api', false);
      await finish(`${target}년 공휴일 ${fetched.length}건 중 ${saved}건을 새로 등록했습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '공휴일을 불러오지 못했습니다.');
    } finally { setBusy(''); }
  };

  const importFromCsv = async (file: File) => {
    setBusy('csv'); setError(''); setNotice('');
    try {
      const parsed = parseHolidayCsv(decodeCsv(await file.arrayBuffer()));
      if (!parsed.holidays.length) {
        setError('CSV에서 날짜 열을 찾지 못했습니다. 파일 형식을 확인해 주세요.');
        return;
      }
      const inYear = parsed.holidays.filter((item) => item.date.startsWith(`${target}-`));
      if (!inYear.length) {
        setError(`CSV에 ${target}년 날짜가 없습니다. 연도를 바꾸거나 다른 파일을 올려 주세요.`);
        return;
      }
      const saved = await saveHolidays(workspaceId, inYear, 'public_api', false);
      await finish(`CSV의 ${target}년 ${inYear.length}건 중 ${saved}건을 새로 등록했습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CSV를 읽지 못했습니다.');
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addCustom = async () => {
    if (!draftDate || !draftName.trim()) { setError('날짜와 이름을 모두 입력해 주세요.'); return; }
    setBusy('add'); setError(''); setNotice('');
    try {
      await saveHolidays(workspaceId, [{ date: draftDate, name: draftName.trim() }], 'custom', true);
      setDraftDate(''); setDraftName('');
      await finish('휴일을 추가했습니다.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '휴일을 추가하지 못했습니다.');
    } finally { setBusy(''); }
  };

  const remove = async (date: string) => {
    setBusy(date); setError(''); setNotice('');
    try {
      await deleteHoliday(workspaceId, date);
      await finish('휴일에서 제외했습니다.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '휴일을 삭제하지 못했습니다.');
    } finally { setBusy(''); }
  };

  const years = [year - 1, year, year + 1];

  // 선택한 해가 마지막으로 언제 자동으로 채워졌는지. 실패했으면 사유까지 보여 줍니다 —
  // 키가 빠졌거나 API가 죽었을 때 관리자가 알아야 손을 쓸 수 있습니다.
  const syncStatus = useMemo(() => {
    const record = syncs.find((item) => item.year === target);
    if (!record) return '';
    const when = (value: string) => new Date(value).toLocaleString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    // 가져오는 중에는 자리만 맡아 둔 상태(note='가져오는 중', 성공 아님)로 잠깐 남습니다.
    const running = record.note === RUNNING_NOTE;
    const failure = running ? '' : record.note;

    if (record.succeededAt) {
      const base = `${target}년 자동 갱신: ${when(record.succeededAt)}에 ${record.importedCount}건을 새로 등록했습니다.`;
      // 마지막 시도가 실패였다면 성공 이력과 함께 알려 줍니다. 성공 기록만 보이면
      // 지금 갱신이 멈춰 있다는 걸 눈치챌 수 없습니다.
      return failure ? `${base} (이후 시도 실패: ${failure})` : base;
    }
    if (running) return `${target}년 공휴일을 지금 가져오고 있습니다.`;
    return `${target}년 자동 갱신이 아직 성공하지 못했습니다${failure ? ` — ${failure}` : ''}.`;
  }, [syncs, target]);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-black"><CalendarDays size={17} />공휴일</h2>
          <p className="mt-1 text-xs text-slate-500">
            토·일에 더해 여기 등록된 날이 휴일입니다. 휴일 근무는 <strong>휴일근로</strong>로 잡히고 지각·조기퇴근을 따지지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={target} onChange={(event) => setTarget(Number(event.target.value))} aria-label="연도"
            className="h-10 rounded-lg border border-slate-300 px-2 text-xs font-bold">
            {years.map((item) => <option key={item} value={item}>{item}년</option>)}
          </select>
          <button type="button" onClick={() => void importFromApi()} disabled={!!busy}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#611f69] px-3 text-xs font-bold text-white disabled:opacity-40">
            {busy === 'api' ? <LoaderCircle size={15} className="animate-spin" /> : <CloudDownload size={15} />}공공데이터 불러오기
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40">
            {busy === 'csv' ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}CSV 업로드
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFromCsv(file); }} />
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <label className="text-[11px] font-bold text-slate-600">날짜
          <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)}
            className="mt-1 block h-9 rounded-lg border border-slate-300 px-2 text-sm" />
        </label>
        <label className="flex-1 text-[11px] font-bold text-slate-600">휴일 이름
          <input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={60}
            placeholder="창립기념일, 단체 연차 등"
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addCustom(); } }}
            className="mt-1 block h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
        </label>
        <button type="button" onClick={() => void addCustom()} disabled={!!busy}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold disabled:opacity-40">
          <Plus size={14} />직접 추가
        </button>
      </div>

      {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}

      {loading ? (
        <div className="grid min-h-32 place-items-center"><LoaderCircle className="animate-spin text-[#611f69]" aria-label="불러오는 중" /></div>
      ) : items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          {target}년에 등록된 공휴일이 없습니다. 위에서 불러오거나 직접 추가해 주세요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.date} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-28 shrink-0 text-xs font-bold tabular-nums">{item.date} ({weekdayOf(item.date)})</span>
                <span className="truncate text-sm">{item.name}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${item.source === 'custom' ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                  {SOURCE_LABEL[item.source]}
                </span>
              </div>
              <button type="button" onClick={() => void remove(item.date)} disabled={!!busy}
                aria-label={`${item.date} 휴일에서 제외`}
                className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                {busy === item.date ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-slate-100 px-5 py-3">
        <p className="text-[11px] text-slate-400">
          출처는 한국천문연구원 특일 정보(공공데이터포털)입니다. 다시 불러와도 <strong>이미 등록된 날짜는 덮어쓰지 않습니다</strong> —
          직접 손본 이름과 자체 휴일이 그대로 남습니다. 우리 회사는 정상 근무하는 날이면 목록에서 지우면 됩니다.
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          <strong className="text-slate-500">자동 갱신</strong> — 관리자가 앱을 열면 올해 공휴일을 알아서 채우고,
          7월부터는 내년 것도 미리 당겨옵니다. 성공한 뒤에도 7일마다 다시 확인합니다
          (<strong>임시공휴일은 연중에 추가</strong>되기 때문입니다). 아래 버튼은 지금 당장 받고 싶을 때만 쓰면 됩니다.
        </p>
        {syncStatus && <p className="mt-2 text-[11px] font-semibold text-slate-500">{syncStatus}</p>}
      </div>
    </section>
  );
}
