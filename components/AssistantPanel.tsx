'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, LoaderCircle, Navigation, Plus, RefreshCcw, Send, ShieldCheck, UserRound } from 'lucide-react';
import { requestAssistant } from '@/lib/aiClient';
import type { AssistantAnswer } from '@/lib/aiTypes';
import { getWorkdaySchedule, loadWorkSchedule, useStore } from '@/lib/store';
import { computePeriodStats } from '@/lib/stats';
import type { CommuteRecord, User } from '@/lib/types';
import AiEvidencePanel from './AiEvidencePanel';
import StatusIcon from './StatusIcon';

const MAX_QUESTION_LENGTH = 300;
const STARTERS = ['오늘 몇 시에 출발하면 좋을까?', '최근 출근 기록을 요약해 줘', '이동 경로는 어디서 확인해?'];
type Intent = 'departure' | 'route' | 'summary' | 'other';
type Turn = { id: number; question: string; answer: AssistantAnswer; intent: Intent; failed: boolean };
function normalize(value: string) { return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_QUESTION_LENGTH); }
function classify(question: string): Intent { const text = question.replace(/\s/g, ''); if (/(출발|몇시|언제).*(출근|도착)|(출근|도착).*(출발|몇시|언제)/.test(text)) return 'departure'; if (/(경로|환승|도보|거리|지도)/.test(text)) return 'route'; if (/(요약|통계|최근|지각|평균)/.test(text)) return 'summary'; return 'other'; }

export default function AssistantPanel({ user, records }: { user: User; records: CommuteRecord[] }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const schedule = useStore((state) => state.workSchedule);
  const setSchedule = useStore((state) => state.setWorkSchedule);
  useEffect(() => { setSchedule(loadWorkSchedule(user.id)); }, [setSchedule, user.id]);
  const stats = useMemo(() => computePeriodStats(records, 'month', new Date(), schedule), [records, schedule]);

  function basicAnswer(intent: Intent): AssistantAnswer {
    const average = stats.avgCommuteDuration;
    if (intent === 'summary') return { text: stats.commuteArrivals.length ? `이번 달 완료된 출근 기록은 ${stats.commuteArrivals.length}건이에요.` : '이번 달에는 분석할 수 있는 완료된 출근 기록이 아직 없어요.', details: [average === null ? '이동 시간을 기록하면 평균 출근 시간을 알려 드릴게요.' : `평균 출근 시간은 ${average}분이에요.`, stats.lateRate === null ? '도착 기록이 더 쌓이면 지각 비율도 계산할 수 있어요.' : `근무 시작 시간을 기준으로 한 지각 비율은 ${stats.lateRate}%예요.`] };
    if (intent === 'route') return { text: '저장된 주소는 지도 화면에서 안전하게 확인할 수 있어요.', details: ['이 화면에는 정확한 집·회사 주소를 표시하지 않아요.', '실시간 경로를 확인하지 못하면 예상 정보를 실제 정보처럼 안내하지 않아요.'] };
    if (intent === 'departure') { const start = getWorkdaySchedule(schedule, new Date()).startTime; return { text: average === null ? '완료된 출근 기록이 없어 알맞은 출발 시각을 아직 계산하기 어려워요.' : `${start} 근무 시작과 평균 ${average}분 이동을 기준으로 여유 시간을 더해 출발해 보세요.`, details: ['요일별 근무 시간 설정이 있으면 오늘 설정을 먼저 적용해요.', '교통과 날씨에 따라 실제 이동 시간은 달라질 수 있어요.'] }; }
    return { text: '출발 시각, 최근 출근 기록, 이동 경로에 관해 물어보세요.', details: ['예: “평균 이동 시간이 얼마나 돼?”, “오늘 몇 시에 출발할까?”'] };
  }

  async function ask(raw: string) {
    const question = normalize(raw).trim();
    if (!question || busy) return;
    const intent = classify(question), base = basicAnswer(intent), id = nextId.current++;
    setBusy(true);
    try {
      const result = await requestAssistant({ question, context: { averageMinutes: stats.avgCommuteDuration, variabilityMinutes: stats.weekly.variabilityMinutes, lateRate: stats.lateRate } }).enhancement;
      const failed = result.fallback === true;
      const answer = failed ? base : { text: result.conclusion || result.text || base.text, details: result.details?.slice(0, 6) || base.details, evidence: result.evidence, sources: result.sources, cautions: result.cautions };
      setTurns((items) => [...items, { id, question, answer, intent, failed }]);
    } catch { setTurns((items) => [...items, { id, question, answer: base, intent, failed: true }]); }
    finally { setBusy(false); requestAnimationFrame(() => inputRef.current?.focus()); }
  }
  function submit(event: FormEvent) { event.preventDefault(); const question = input.trim(); if (!question || busy) return; setInput(''); void ask(question); }
  function startNew() { setTurns([]); setInput(''); requestAnimationFrame(() => inputRef.current?.focus()); }
  const suggestions = turns.length ? ['조금 더 쉽게 설명해 줘', '평균 이동 시간도 알려 줘', '오늘 출발 시각을 추천해 줘'] : STARTERS;

  return <div className="min-w-0 space-y-4">
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 sm:p-5"><div className="flex items-start gap-3"><StatusIcon icon={Bot} tone="blue" size="lg"/><div className="min-w-0 flex-1"><h2 className="font-bold text-slate-950">출퇴근 비서</h2><p className="mt-0.5 text-xs leading-5 text-slate-600">저장된 출퇴근 기록만 참고해 답해요. 주소나 연락처는 질문에 적지 마세요.</p></div>{turns.length > 0 && <button type="button" onClick={startNew} disabled={busy} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"><Plus size={15}/>새 질문</button>}</div></section>
    {turns.length > 0 && <div className="space-y-4" aria-live="polite">{turns.map((turn) => <div key={turn.id} className="space-y-2"><div className="ml-auto flex max-w-[92%] items-start justify-end gap-2 sm:max-w-[85%]"><div className="rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-3 text-sm leading-6 text-white">{turn.question}</div><UserRound size={18} className="mt-3 shrink-0 text-slate-400"/></div><section className="card mr-auto max-w-[96%] p-4 sm:max-w-[90%] sm:p-5"><div className="flex items-start gap-2"><Bot size={18} className="mt-0.5 shrink-0 text-blue-600"/><div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-6 text-slate-900">{turn.answer.text}</p><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">{turn.answer.details.map((detail, index) => <li key={`${index}-${detail}`} className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-blue-600"/>{detail}</li>)}</ul>{turn.intent === 'route' && <Link href="/map" className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><Navigation size={14}/>지도에서 경로 보기</Link>}{turn.failed && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p>답변 서비스가 잠시 원활하지 않아 저장된 기록으로 기본 안내를 드렸어요.</p><button type="button" onClick={() => void ask(turn.question)} disabled={busy} className="mt-1 inline-flex min-h-9 items-center gap-1 font-bold disabled:opacity-50"><RefreshCcw size={14}/>이 질문 다시 시도</button></div>}<AiEvidencePanel evidence={turn.answer.evidence ?? [{ label: '저장된 출퇴근 기록과 근무 시간 설정', kind: 'record', fallback: true, source: '이 앱에 저장된 내 기록' }]} sources={turn.answer.sources ?? ['저장된 출퇴근 기록']} cautions={turn.answer.cautions ?? ['실제 교통과 날씨에 따라 결과가 달라질 수 있어요.']}/></div></div></section></div>)}</div>}
    {busy && <div role="status" className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800"><LoaderCircle size={16} className="animate-spin"/>기록을 살펴보고 답변을 준비하고 있어요…</div>}
    <div><p className="mb-2 px-1 text-xs font-bold text-slate-600">{turns.length ? '이어서 물어보세요' : '추천 질문'}</p><div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">{suggestions.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={busy} className="min-h-10 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50">{item}</button>)}</div></div>
    <form onSubmit={submit} className="card sticky bottom-3 z-10 p-3 shadow-lg shadow-slate-200/60"><div className="flex min-w-0 gap-2"><label className="sr-only" htmlFor="assistant-question">질문</label><input ref={inputRef} id="assistant-question" value={input} maxLength={MAX_QUESTION_LENGTH} autoComplete="off" spellCheck={false} onChange={(event) => setInput(normalize(event.target.value))} placeholder={turns.length ? '이어서 궁금한 점을 물어보세요' : '출퇴근 질문을 입력하세요'} className="min-w-0 flex-1 rounded-xl border border-transparent bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"/><button type="submit" disabled={busy || !input.trim()} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" aria-label="질문 보내기">{busy ? <LoaderCircle size={18} className="animate-spin"/> : <Send size={18}/>}</button></div><div className="mt-2 flex items-start justify-between gap-3 px-1 text-[11px] text-slate-500"><p>{turns.length ? '답변 뒤에도 계속 질문할 수 있어요.' : '주소, 연락처, 계정 정보는 입력하지 마세요.'}</p><span className="shrink-0 tabular-nums" aria-label={`입력 글자 수 ${input.length}/${MAX_QUESTION_LENGTH}`}>{input.length}/{MAX_QUESTION_LENGTH}</span></div></form>
  </div>;
}
