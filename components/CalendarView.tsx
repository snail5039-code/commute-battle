'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, RotateCcw, Trash2 } from 'lucide-react';
import { CommuteRecord } from '@/lib/types';
import { loadExcludedRecordIds, setRecordExcluded } from '@/lib/recordOverrides';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const LABELS: Record<CommuteRecord['type'], string> = { commute: '출근', return: '퇴근', early_leave: '조퇴', vacation: '휴가', sick: '병가', absence: '결근' };

function key(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

  return (
    <section className="card overflow-hidden">
      <div className="grid lg:grid-cols-[1.35fr_.85fr]">
        <div ref={calendarRef} className="p-5">
          <h3 className="text-sm font-bold">{year}년 {month + 1}월 근무 캘린더</h3>
          <div className="mt-4 grid grid-cols-7 gap-1">
            {DAYS.map((d) => <div key={d} className="pb-1 text-center text-xs text-slate-400">{d}</div>)}
            {days.map((d) => {
              const date = key(d), items = records.filter((r) => r.date === date), active = date === selected;
              return (
                <button key={date} onClick={() => setSelected(date)} className={`aspect-square rounded-xl p-1 text-xs ${active ? 'bg-blue-600 text-white' : d.getMonth() === month ? 'bg-slate-50' : 'text-slate-300'}`}>
                  <span>{d.getDate()}</span>
                  <span className="mt-1 flex justify-center gap-0.5">{items.slice(0, 3).map((r) => <i key={r.id} className={`size-1.5 rounded-full ${excluded.has(r.id) ? 'bg-slate-400' : active ? 'bg-white' : 'bg-blue-500'}`} />)}</span>
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
          </div>
          {selectedRecords.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">기록이 없는 날이에요.</p>
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
                    <button onClick={() => toggle(r.id, !isExcluded)} className={`mt-3 flex items-center gap-1 text-xs font-semibold ${isExcluded ? 'text-blue-700' : 'text-rose-600'}`}>
                      {isExcluded ? <><RotateCcw size={13} />통계에 복구</> : <><Trash2 size={13} />통계에서 제외</>}
                    </button>
                    {isExcluded && <p className="mt-1 text-[11px] text-slate-500">이 기기의 통계에서만 제외되며 원본 기록은 유지됩니다.</p>}
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
