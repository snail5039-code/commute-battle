'use client';

import { useState } from 'react';
import { AlertCircle, Check, PencilLine, X } from 'lucide-react';
import { requestCorrection, type MyCorrectionRequest } from '@/lib/attendance';
import type { CommuteRecord } from '@/lib/types';

const STATUS_LABEL = { pending: '정정 검토 중', approved: '정정 승인됨', rejected: '정정 반려됨' } as const;
const STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-rose-50 text-rose-700',
} as const;

// datetime-local 입력은 현지 시각 문자열만 받습니다.
function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AttendanceCorrection({ record, correction, onRequested }: { record: CommuteRecord; correction?: MyCorrectionRequest; onRequested: () => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(() => toLocalInput(record.start_time));
  const [end, setEnd] = useState(() => toLocalInput(record.end_time));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (correction && correction.status === 'pending') {
    return <p className={`mt-2 rounded-md px-2 py-1.5 text-[11px] font-semibold ${STATUS_STYLE.pending}`}>
      {STATUS_LABEL.pending} · 관리자 승인 후 기록이 바뀝니다
    </p>;
  }

  const submit = async () => {
    setSaving(true); setError('');
    try {
      // 값이 그대로면 보내지 않습니다. 문자열 형식이 서로 달라서 시각 값으로 비교합니다.
      const changed = (next: string | null, current?: string) => {
        if (!next) return null;
        if (current && new Date(next).getTime() === new Date(current).getTime()) return null;
        return next;
      };
      await requestCorrection({
        recordId: record.id,
        start: changed(start ? new Date(start).toISOString() : null, record.start_time),
        end: changed(end ? new Date(end).toISOString() : null, record.end_time),
        reason,
      });
      setOpen(false); setReason(''); onRequested();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '정정 요청을 보내지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      {correction && correction.status !== 'pending' && (
        <p className={`mb-2 rounded-md px-2 py-1.5 text-[11px] font-semibold ${STATUS_STYLE[correction.status]}`}>
          {STATUS_LABEL[correction.status]}{correction.reviewerNote ? ` · ${correction.reviewerNote}` : ''}
        </p>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-blue-700">
          <PencilLine size={13} />기록 정정 요청
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <label className="block text-[11px] font-bold text-slate-600">출발 시각
            <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-xs" />
          </label>
          <label className="block text-[11px] font-bold text-slate-600">도착 시각
            <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-xs" />
          </label>
          <label className="block text-[11px] font-bold text-slate-600">사유 (5자 이상)
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} placeholder="예: 지하철 지연으로 도착 기록을 늦게 눌렀습니다." className="mt-1 w-full resize-none rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
          </label>
          {error && <p role="alert" className="flex gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={12} className="mt-px shrink-0" />{error}</p>}
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => { setOpen(false); setError(''); }} className="flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-[11px] font-bold"><X size={12} />취소</button>
            <button type="button" onClick={() => void submit()} disabled={saving || reason.trim().length < 5} className="flex h-8 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11px] font-bold text-white disabled:opacity-50"><Check size={12} />{saving ? '보내는 중…' : '요청 보내기'}</button>
          </div>
          <p className="text-[10px] text-slate-500">원본 기록은 지워지지 않고, 승인 이력이 함께 저장됩니다.</p>
        </div>
      )}
    </div>
  );
}
