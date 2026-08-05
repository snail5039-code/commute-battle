'use client';

import { Check, Clock, Palmtree, X } from 'lucide-react';
import { CommuteRecord } from '@/lib/types';

interface CalendarViewProps {
  records: CommuteRecord[];
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

type RecordIcon = { Icon: typeof Check; color: string } | null;

export default function CalendarView({ records }: CalendarViewProps) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  const days = [];
  const date = new Date(startDate);

  while (date <= lastDay || date.getDay() !== 0) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }

  const getRecordIcon = (dateStr: string): RecordIcon => {
    const record = records.find((r) => r.date === dateStr);
    if (!record) return null;

    if (record.type === 'absence') return { Icon: X, color: 'text-red-500' };
    if (record.type === 'vacation' || record.type === 'sick')
      return { Icon: Palmtree, color: 'text-emerald-500' };
    if (record.type === 'early_leave')
      return { Icon: Clock, color: 'text-amber-500' };
    if (record.type === 'commute' && record.end_time)
      return { Icon: Check, color: 'text-blue-500' };
    return null;
  };

  return (
    <div className="card p-6">
      <h3 className="text-[13px] font-semibold text-neutral-900 mb-4">
        {year}년 {month + 1}월
      </h3>

      <div className="grid grid-cols-7 gap-1.5">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            className="text-center text-[11px] font-medium text-neutral-400 pb-1"
          >
            {day}
          </div>
        ))}

        {days.map((date, idx) => {
          const dateStr = date.toISOString().split('T')[0];
          const isCurrentMonth = date.getMonth() === month;
          const isToday = dateStr === today.toISOString().split('T')[0];
          const recordIcon = getRecordIcon(dateStr);

          return (
            <div
              key={idx}
              className={`aspect-square flex items-center justify-center rounded-[10px] ${
                isToday
                  ? 'bg-blue-500/10 ring-1 ring-blue-400'
                  : isCurrentMonth
                    ? 'bg-neutral-50'
                    : 'bg-transparent text-neutral-300'
              }`}
            >
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className={`text-[11px] ${isToday ? 'text-blue-600 font-semibold' : 'text-neutral-500'}`}
                >
                  {date.getDate()}
                </span>
                {recordIcon && (
                  <recordIcon.Icon
                    size={12}
                    strokeWidth={2.5}
                    className={recordIcon.color}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1">
          <Check size={12} className="text-blue-500" /> 출근 완료
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} className="text-amber-500" /> 조퇴
        </span>
        <span className="flex items-center gap-1">
          <Palmtree size={12} className="text-emerald-500" /> 휴가 · 병가
        </span>
        <span className="flex items-center gap-1">
          <X size={12} className="text-red-500" /> 결근
        </span>
      </div>
    </div>
  );
}
