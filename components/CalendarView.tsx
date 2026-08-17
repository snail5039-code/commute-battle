'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, EyeOff, RotateCcw } from 'lucide-react';
import { CommuteRecord } from '@/lib/types';
import { loadExcludedRecordIds, setRecordExcluded } from '@/lib/recordOverrides';
import { fetchMyCorrections, type MyCorrectionRequest } from '@/lib/attendance';
import { fetchHolidays, type WorkHoliday } from '@/lib/holidays';
import { attendanceWorkspaceId } from '@/lib/attendance';
import AttendanceCorrection from './AttendanceCorrection';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const LABELS: Record<CommuteRecord['type'], string> = { commute: '출근', return: '퇴근', early_leave: '조퇴', vacation: '휴가', sick: '병가', absence: '결근' };

function key(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
// 좁은 달력 칸에 맞게 줄인다: 대체공휴일(광복절) → 광복절 대체
function shortHolidayName(name: string) {
  const prefix = '대체공휴일(';
  return name.startsWith(prefix) && name.endsWith(')')
    ? `${name.slice(prefix.length, -1)} 대체`
    : name;
}

function time(value?: string) {
  if (!value) return '미기록';
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export default function CalendarView({ records }: { records: CommuteRecord[] }) {
  const today = new Date(), year = today.getFullYear(), month = today.getMonth(), userId = records[0]?.user_id;
  const [selected, setSelected] = useState(key(today));
  const [excluded, setExcluded] = useState(() => loadExcludedRecordIds(userId));
  const calendarRef = useRef<HTMLDivElement>(null);
  const [calendarHeight, setCalendarHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = calendarRef.current;
      if (el) setCalendarHeight(el.getBoundingClientRect().height);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  const days = useMemo(() => {
    const first = new Date(year, month, 1), start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  }, [year, month]);

  const selectedRecords = records.filter((r) => r.date === selected);
  const toggle = (id: string, value: boolean) => setExcluded(new Set(setRecordExcluded(userId, id, value)));

  // 이 달의 공휴일. 토·일은 원래 휴일이라 따로 안 불러오고, 등록된 공휴일만 표시합니다.
  const [holidays, setHolidays] = useState<Map<string, WorkHoliday>>(new Map());
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void attendanceWorkspaceId().then(async (workspaceId) => {
        if (!workspaceId || !active) return;
        const from = key(new Date(year, month, 1));
        const to = key(new Date(year, month + 2, 0));  // 달력이 다음 달 초까지 보여줍니다
        const items = await fetchHolidays(workspaceId, from, to).catch(() => []);
        if (active) setHolidays(new Map(items.map((item) => [item.date, item])));
      });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [year, month]);

  // 기록별 최신 정정 요청 상태. 목록이 최신순이라 먼저 담긴 값이 가장 최근 요청입니다.
  const [corrections, setCorrections] = useState<Map<string, MyCorrectionRequest>>(new Map());
  const loadCorrections = useCallback(async () => {
    const items = await fetchMyCorrections().catch(() => []);
    setCorrections(new Map(items.reduceRight<[string, MyCorrectionRequest][]>((acc, item) => { acc.push([item.recordId, item]); return acc; }, [])));
  }, []);
  // useAppData와 같은 방식으로 렌더 직후에 불러옵니다(효과 본문에서 바로 setState 하지 않도록).
  useEffect(() => { const timer = setTimeout(() => { void loadCorrections(); }, 0); return () => clearTimeout(timer); }, [loadCorrections]);

  return (
    <section className="card overflow-hidden">
      <div className="grid lg:grid-cols-[1.35fr_.85fr]">
        <div ref={calendarRef} className="p-5">
          <h3 className="text-sm font-bold">{year}년 {month + 1}월 근무 캘린더</h3>
          <div className="mt-4 grid grid-cols-7 gap-1">
            {DAYS.map((d) => <div key={d} className="pb-1 text-center text-xs text-slate-400">{d}</div>)}
            {days.map((d) => {
              const date = key(d), items = records.filter((r) => r.date === date), active = date === selected;
              const holiday = holidays.get(date);
              const inMonth = d.getMonth() === month;
              // 토·일도 붉게 보이면 공휴일이 묻히므로, 등록된 공휴일만 강조합니다.
              const tone = active ? 'bg-blue-600 text-white'
                : holiday && inMonth ? 'bg-rose-50 text-rose-700 font-bold'
                : inMonth ? 'bg-slate-50' : 'text-slate-300';
              return (
                <button key={date} onClick={() => setSelected(date)} title={holiday?.name}
                  className={`aspect-square rounded-xl p-1 text-xs ${tone}`}>
                  <span className="block leading-tight">{d.getDate()}</span>
                  <span className="mt-1 flex justify-center gap-0.5">{items.slice(0, 3).map((r) => <i key={r.id} className={`size-1.5 rounded-full ${excluded.has(r.id) ? 'bg-slate-400' : active ? 'bg-white' : 'bg-blue-500'}`} />)}</span>
                  {holiday && inMonth && <span className="mt-0.5 block truncate text-[9px] font-semibold leading-none">{shortHolidayName(holiday.name)}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <aside
          className="overflow-y-auto border-t bg-slate-50 p-5 lg:border-l lg:border-t-0"
          style={calendarHeight ? { maxHeight: `${calendarHeight}px` } : undefined}
        >
          <div className="flex items-center gap-2">
            <CalendarDays size={18} />
            <h4 className="font-bold">{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${selected}T12:00:00`))}</h4>
            {holidays.get(selected) && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">{holidays.get(selected)!.name}</span>
            )}
          </div>
          {selectedRecords.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">{holidays.get(selected) ? `${holidays.get(selected)!.name}이라 기록이 없어요.` : '기록이 없는 날이에요.'}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {selectedRecords.map((r) => {
                const isExcluded = excluded.has(r.id);
                return (
                  <li key={r.id} className={`rounded-xl border bg-white p-3 ${isExcluded ? 'opacity-55' : ''}`}>
                    <div className="flex items-center justify-between">
                      <strong className="text-sm">{LABELS[r.type]}</strong>
                      <span className="text-xs text-slate-500">{time(r.start_time)} → {time(r.end_time)}</span>
                    </div>
                    {/* 이 버튼은 이 기기의 개인 통계 화면(/stats)만 가립니다. 근태 집계와 급여 근거가 되는
                        서버 계산(get_attendance_summary)은 원본 기록을 그대로 읽으므로 영향이 없습니다.
                        삭제처럼 보이면 오해를 사서, 문구와 아이콘을 '숨기기'로 맞췄습니다. */}
                    <button onClick={() => toggle(r.id, !isExcluded)} className={`mt-3 flex items-center gap-1 text-xs font-semibold ${isExcluded ? 'text-blue-700' : 'text-slate-600'}`}>
                      {isExcluded ? <><RotateCcw size={13} />내 통계에 다시 표시</> : <><EyeOff size={13} />내 통계에서 숨기기</>}
                    </button>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {isExcluded ? '이 기기의 내 통계에서만 숨겨져 있습니다. ' : '이 기기의 내 통계 화면에서만 가려집니다. '}
                      기록 원본과 <strong>근태 집계·급여에는 그대로 반영</strong>됩니다.
                    </p>
                    <AttendanceCorrection record={r} correction={corrections.get(r.id)} onRequested={() => void loadCorrections()} />
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
