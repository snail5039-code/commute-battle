'use client';

import { useEffect, useState } from 'react';
import { RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { AiEvidence } from '@/lib/aiTypes';

const STORAGE_KEY = 'commute-battle:assistant-feedback:v1';
type Feedback = { helpful: number; unhelpful: number };
const emptyFeedback: Feedback = { helpful: 0, unhelpful: 0 };
const labels = { realtime: '실시간', record: '저장 기록', estimate: '추정값' } as const;

export default function AiEvidencePanel({ evidence, sources, cautions }: { evidence: AiEvidence[]; sources: string[]; cautions: string[] }) {
  const [feedback, setFeedback] = useState<Feedback>(emptyFeedback);
  useEffect(() => {
    function load() { try { setFeedback({ ...emptyFeedback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }); } catch { setFeedback(emptyFeedback); } }
    queueMicrotask(load);
    window.addEventListener('storage', load);
    return () => window.removeEventListener('storage', load);
  }, []);
  function save(next: Feedback) { setFeedback(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }

  return <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
    <div><h3 className="text-xs font-bold text-slate-800">핵심 근거</h3><ul className="mt-2 space-y-2">{evidence.map((item, index) => <li key={`${item.label}-${index}`} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-700">{labels[item.kind]}</span>{item.fallback && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">fallback</span>}<span className="font-semibold text-slate-800">{item.label}</span></div>{item.values?.length ? <p className="mt-1">사용 수치: {item.values.join(' · ')}</p> : null}{item.checkedAt ? <p className="mt-1">확인 시각: {new Date(item.checkedAt).toLocaleString('ko-KR')}</p> : null}{item.source ? <p className="mt-1">출처: {item.source}</p> : null}</li>)}</ul></div>
    <div className="grid gap-3 sm:grid-cols-2"><div><h3 className="text-xs font-bold text-slate-800">출처</h3><p className="mt-1 text-xs leading-5 text-slate-600">{sources.length ? sources.join(' · ') : '앱 내 계산 및 제공된 컨텍스트'}</p></div><div><h3 className="text-xs font-bold text-slate-800">주의사항</h3><p className="mt-1 text-xs leading-5 text-slate-600">{cautions.length ? cautions.join(' · ') : '실제 상황과 차이가 있을 수 있습니다.'}</p></div></div>
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-slate-500">이 답변이 도움 됐나요?</span><button type="button" onClick={() => save({ ...feedback, helpful: feedback.helpful + 1 })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-slate-700 hover:bg-slate-50"><ThumbsUp size={14}/>도움 됨 {feedback.helpful}</button><button type="button" onClick={() => save({ ...feedback, unhelpful: feedback.unhelpful + 1 })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2 text-slate-700 hover:bg-slate-50"><ThumbsDown size={14}/>도움 안 됨 {feedback.unhelpful}</button><button type="button" onClick={() => save(emptyFeedback)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-slate-500 hover:bg-slate-50"><RotateCcw size={14}/>초기화</button></div>
    <p className="text-[11px] text-slate-400">피드백은 이 브라우저의 합계만 저장하며 질문 원문과 주소는 저장하지 않습니다.</p>
  </div>;
}
