'use client';

import { useState } from 'react';
import { ChevronDown, Database, Info, TriangleAlert } from 'lucide-react';
import type { AiEvidence } from '@/lib/aiTypes';

const labels = { realtime: '방금 확인한 정보', record: '내 출퇴근 기록', estimate: '기록으로 계산한 값' } as const;

export default function AiEvidencePanel({ evidence, sources, cautions }: { evidence: AiEvidence[]; sources: string[]; cautions: string[] }) {
  const [open, setOpen] = useState(false);
  return <div className="mt-4 border-t border-slate-100 pt-4">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-2 text-left hover:bg-slate-50"><span className="flex items-center gap-2 text-xs font-bold text-slate-700"><Info size={15} className="text-blue-600"/>이 답변은 무엇을 참고했나요?</span><ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}/></button>
    {open && <div className="mt-2 space-y-4 rounded-xl bg-slate-50 p-3">
      {evidence.length > 0 && <ul className="space-y-2">{evidence.map((item, index) => <li key={`${item.label}-${index}`} className="rounded-xl bg-white p-3 text-xs leading-5 text-slate-600"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-700">{labels[item.kind]}</span>{item.fallback && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">기본 안내</span>}</div><p className="mt-1 font-semibold text-slate-800">{item.label}</p>{item.values?.length ? <p className="mt-1">확인한 값: {item.values.join(' · ')}</p> : null}{item.checkedAt ? <p className="mt-1">확인 시각: {new Date(item.checkedAt).toLocaleString('ko-KR')}</p> : null}{item.source ? <p className="mt-1">참고한 곳: {item.source}</p> : null}</li>)}</ul>}
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white p-3"><h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><Database size={14} className="text-blue-600"/>참고한 정보</h4><p className="mt-1 text-xs leading-5 text-slate-600">{sources.length ? sources.join(' · ') : '앱에 저장된 출퇴근 기록과 설정'}</p></div><div className="rounded-xl bg-white p-3"><h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><TriangleAlert size={14} className="text-amber-600"/>알아두세요</h4><p className="mt-1 text-xs leading-5 text-slate-600">{cautions.length ? cautions.join(' · ') : '실제 교통 상황에 따라 달라질 수 있어요.'}</p></div></div>
    </div>}
  </div>;
}
