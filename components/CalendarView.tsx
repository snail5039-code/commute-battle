'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock3,
  DoorOpen,
  Palmtree,
  Stethoscope,
  X,
} from 'lucide-react';
import { CommuteRecord } from '@/lib/types';

interface CalendarViewProps { records: CommuteRecord[]; }

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const TYPE_META = {
  commute: { label: '출근', Icon: BriefcaseBusiness, tone: 'bg-sky-50 text-sky-700' },
  return: { label: '퇴근', Icon: DoorOpen, tone: 'bg-indigo-50 text-indigo-700' },
  early_leave: { label: '조퇴', Icon: Clock3, tone: 'bg-amber-50 text-amber-700' },
  vacation: { label: '휴가', Icon: Palmtree, tone: 'bg-emerald-50 text-emerald-700' },
  sick: { label: '병가', Icon: Stethoscope, tone: 'bg-rose-50 text-rose-700' },
  absence: { label: '결근', Icon: X, tone: 'bg-slate-100 text-slate-700' },
} as const;

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(value?: string) {
  if (!value) return '미기록';
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function durationLabel(record: CommuteRecord) {
  const minutes = record.duration_minutes ?? (record.start_time && record.end_time
    ? Math.max(0, Math.round((new Date(record.end_time).getTime() - new Date(record.start_time).getTime()) / 60000))
    : null);
  if (minutes === null) return record.start_time ? '진행 중' : '소요 시간 미기록';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

export default function CalendarView({ records }: CalendarViewProps) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayKey = toDateKey(today);
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    const result: Date[] = [];
    const cursor = new Date(startDate);
    while (cursor <= lastDay || cursor.getDay() !== 0) {
      result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [month, year]);

  const selectedRecords = records.filter((record) => record.date === selectedDate);
  const selectedDateLabel = new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'long',
  }).format(new Date(`${selectedDate}T12:00:00`));
  const commuteCount = selectedRecords.filter((record) => record.type === 'commute').length;
  const returnCount = selectedRecords.filter((record) => record.type === 'return').length;

  return (
    <section className="card overflow-hidden" aria-labelledby="calendar-title">
      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,.85fr)]">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 id="calendar-title" className="text-[14px] font-bold text-slate-900">{year}년 {month + 1}월 근무 캘린더</h3>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">날짜를 눌러 상세 보기</span>
          </div>
          <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={`${year}년 ${month + 1}월`}>
            {DAY_NAMES.map((day, index) => (
              <div key={day} role="columnheader" className={`pb-1 text-center text-[11px] font-semibold ${index === 0 ? 'text-rose-400' : index === 6 ? 'text-sky-500' : 'text-slate-400'}`}>{day}</div>
            ))}
            {days.map((date) => {
              const dateStr = toDateKey(date);
              const dayRecords = records.filter((record) => record.date === dateStr);
              const isCurrentMonth = date.getMonth() === month;
              const isToday = dateStr === todayKey;
              const isSelected = dateStr === selectedDate;
              const types = [...new Set(dayRecords.map((record) => record.type))].slice(0, 3);
              return (
                <button key={dateStr} type="button" role="gridcell" onClick={() => setSelectedDate(dateStr)}
                  aria-selected={isSelected} aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일, 기록 ${dayRecords.length}건`}
                  className={`relative aspect-square min-h-10 rounded-xl border text-center transition-all ${isSelected ? 'border-blue-500 bg-blue-600 text-white shadow-md shadow-blue-100' : isToday ? 'border-blue-300 bg-blue-50 text-blue-700' : isCurrentMonth ? 'border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-white' : 'border-transparent bg-transparent text-slate-300'}`}>
                  <span className="text-[11px] font-semibold">{date.getDate()}</span>
                  <span className="mt-1 flex min-h-1.5 items-center justify-center gap-0.5" aria-hidden="true">
                    {types.map((type) => <span key={type} className={`size-1.5 rounded-full ${isSelected ? 'bg-white/85' : type === 'absence' || type === 'sick' ? 'bg-rose-400' : type === 'early_leave' ? 'bg-amber-400' : type === 'vacation' ? 'bg-emerald-400' : type === 'return' ? 'bg-indigo-400' : 'bg-sky-500'}`} />)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-500" aria-label="캘린더 범례">
            <span className="flex items-center gap-1"><Check size={12} className="text-sky-500" /> 출퇴근</span>
            <span className="flex items-center gap-1"><Clock3 size={12} className="text-amber-500" /> 조퇴</span>
            <span className="flex items-center gap-1"><Palmtree size={12} className="text-emerald-500" /> 휴가</span>
            <span className="flex items-center gap-1"><Stethoscope size={12} className="text-rose-500" /> 병가·결근</span>
          </div>
        </div>

        <aside className="border-t border-slate-200 bg-slate-50/80 p-5 sm:p-6 lg:border-l lg:border-t-0" aria-live="polite" aria-label="선택한 날짜 상세">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">선택한 날짜</p><h4 className="mt-1 text-base font-extrabold text-slate-900">{selectedDateLabel}</h4></div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100"><CalendarDays size={20} aria-hidden="true" /></span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-sky-100 bg-white p-3"><span className="text-[11px] text-slate-500">출근 횟수</span><strong className="mt-1 block text-lg text-sky-700">{commuteCount}회</strong></div>
            <div className="rounded-xl border border-indigo-100 bg-white p-3"><span className="text-[11px] text-slate-500">퇴근 횟수</span><strong className="mt-1 block text-lg text-indigo-700">{returnCount}회</strong></div>
          </div>
          {selectedRecords.length === 0 ? (
            <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 text-center">
              <CalendarDays size={28} className="text-slate-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-slate-700">기록이 없는 날이에요</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">출퇴근이나 휴가 기록이 생기면<br />이곳에서 상세 시간을 확인할 수 있어요.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2" aria-label={`${selectedDateLabel} 기록`}>
              {selectedRecords.map((record) => {
                const meta = TYPE_META[record.type];
                const Icon = meta.Icon;
                return (
                  <li key={record.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2"><span className={`inline-flex items-center gap-2 rounded-xl py-1 pr-2.5 text-[11px] font-bold ${meta.tone}`}><span className="flex size-7 items-center justify-center rounded-lg bg-white/80 ring-1 ring-inset ring-current/10"><Icon size={15} aria-hidden="true" /></span>{meta.label}</span><span className="text-[11px] font-semibold text-slate-500">{durationLabel(record)}</span></div>
                    {(record.start_time || record.end_time) && <div className="mt-2 flex items-center gap-2 text-xs text-slate-600"><span>{formatTime(record.start_time)}</span><ArrowRight size={12} className="text-slate-300" aria-hidden="true" /><span>{formatTime(record.end_time)}</span></div>}
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
