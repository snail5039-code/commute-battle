'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, Navigation, Send, ShieldCheck } from 'lucide-react';
import { requestAssistant } from '@/lib/aiClient';
import type { AssistantAnswer } from '@/lib/aiTypes';
import { getWorkdaySchedule, loadWorkSchedule, useStore } from '@/lib/store';
import { computePeriodStats } from '@/lib/stats';
import type { CommuteRecord, User } from '@/lib/types';
import AiEvidencePanel from './AiEvidencePanel';
import StatusIcon from './StatusIcon';

const MAX_QUESTION_LENGTH = 300;

function normalizeQuestion(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_QUESTION_LENGTH);
}

function classify(question: string) {
  const compact = question.replace(/\s/g, '');
  if (/(출발|몇시|언제).*(출근|도착)|(출근|도착).*(출발|몇시|언제)/.test(compact)) return 'departure';
  if (/(경로|환승|도보|걷기)/.test(compact)) return 'route';
  if (/(요약|통계|최근|지각|평균)/.test(compact)) return 'summary';
  return 'other';
}

export default function AssistantPanel({ user, records }: { user: User; records: CommuteRecord[] }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [answerIntent, setAnswerIntent] = useState<ReturnType<typeof classify>>('other');
  const schedule = useStore((state) => state.workSchedule);
  const setSchedule = useStore((state) => state.setWorkSchedule);

  useEffect(() => { setSchedule(loadWorkSchedule(user.id)); }, [setSchedule, user.id]);
  const stats = useMemo(() => computePeriodStats(records, 'month', new Date(), schedule), [records, schedule]);

  async function ask(rawQuestion: string) {
    const question = normalizeQuestion(rawQuestion).trim();
    if (!question || busy) return;
    const intent = classify(question);
    setAnswerIntent(intent);
    const average = stats.avgCommuteDuration;
    const todaySchedule = getWorkdaySchedule(schedule, new Date());
    const fallback: AssistantAnswer = intent === 'summary' ? {
      text: stats.commuteArrivals.length ? `이번 달 완료된 출근 ${stats.commuteArrivals.length}건을 확인했어요.` : '이번 달에 분석할 수 있는 완료 출근 기록이 아직 없어요.',
      details: [average === null ? '평균 출근 시간은 기록이 더 필요해요.' : `평균 출근 시간은 ${average}분이에요.`, stats.lateRate === null ? '지각률은 평가 가능한 기록이 없어 계산하지 않았어요.' : `설정한 근무 시작 기준 지각률은 ${stats.lateRate}%예요.`],
    } : intent === 'route' ? {
      text: '저장 주소와 현재 경로 정보는 이동 화면에서 안전하게 확인할 수 있어요.',
      details: ['비서 답변에는 정확한 집·회사 주소를 표시하지 않아요.', '실시간 경로가 없으면 예상 경로를 지어내지 않아요.'],
    } : intent === 'departure' ? {
      text: average === null ? '완료된 출근 기록이 없어 출발 시각을 계산하기 어려워요.' : `${todaySchedule.startTime} 근무 시작과 평균 ${average}분 이동을 기준으로 여유 시간을 더해 출발하세요.`,
      details: ['요일별 근무시간 설정이 있으면 해당 설정을 우선 적용해요.', '교통과 날씨에 따라 실제 소요 시간은 달라질 수 있어요.'],
    } : {
      text: '출발 시각, 경로, 최근 출퇴근 통계를 질문해 주세요.',
      details: ['계정 정보, 연락처, 정확한 주소 같은 민감정보는 입력하지 마세요.'],
    };
    setAnswer(fallback);
    if (intent === 'other') return;

    setBusy(true);
    try {
      const request = requestAssistant({ question, context: { averageMinutes: average, variabilityMinutes: stats.weekly.variabilityMinutes, lateRate: stats.lateRate } });
      const enhanced = await request.enhancement;
      setAnswer({
        text: enhanced.conclusion || enhanced.text || fallback.text,
        details: enhanced.details?.slice(0, 6) || fallback.details,
        evidence: enhanced.evidence,
        sources: enhanced.sources,
        cautions: enhanced.cautions,
      });
    } catch {
      setAnswer(fallback);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput('');
    void ask(question);
  }

  const examples = ['언제 출발하면 좋을까?', '걷기 적은 경로를 보고 싶어', '최근 출퇴근 통계 요약'];
  return <div className="min-w-0 space-y-4">
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5"><div className="flex items-center gap-3"><StatusIcon icon={Bot} tone="blue" size="lg"/><div><h2 className="font-bold text-slate-950">출퇴근 비서</h2><p className="mt-0.5 text-xs leading-5 text-slate-500">저장된 통계만 사용하고, 없는 실시간 정보는 추측하지 않아요.</p></div></div></section>
    <div className="flex flex-wrap gap-2">{examples.map((example) => <button key={example} type="button" onClick={() => void ask(example)} disabled={busy} className="min-h-10 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50">{example}</button>)}</div>
    {answer && <section aria-live="polite" className="card p-5"><h3 className="text-xs font-bold text-slate-500">답변</h3><p className="mt-1 text-sm font-semibold leading-6 text-slate-900">{answer.text}</p><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">{answer.details.map((detail, index) => <li key={`${index}-${detail}`} className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-blue-600"/>{detail}</li>)}</ul>{answerIntent === 'route' && <Link href="/map" className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><Navigation size={14}/>이동 화면 열기</Link>}<AiEvidencePanel evidence={answer.evidence ?? [{ label: '저장된 출퇴근 기록', kind: 'record', fallback: true, source: '이 브라우저의 사용자 기록' }]} sources={answer.sources ?? ['출퇴근 기록']} cautions={answer.cautions ?? ['실제 교통 상황과 차이가 있을 수 있습니다.']}/></section>}
    <form onSubmit={submit} className="card p-3"><div className="flex min-w-0 gap-2"><label className="sr-only" htmlFor="assistant-question">질문</label><input id="assistant-question" value={input} maxLength={MAX_QUESTION_LENGTH} autoComplete="off" spellCheck={false} onChange={(event) => setInput(normalizeQuestion(event.target.value))} placeholder="출퇴근 질문을 입력하세요" className="min-w-0 flex-1 rounded-xl border border-transparent bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"/><button disabled={busy || !input.trim()} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-50" aria-label="질문 보내기"><Send size={18}/></button></div><div className="mt-2 flex items-start justify-between gap-3 px-1 text-[11px] text-slate-400"><p>정확한 주소, 연락처, 계정 정보는 질문에 입력하지 마세요.</p><span className="shrink-0 tabular-nums" aria-label={`입력 글자 수 ${input.length}/${MAX_QUESTION_LENGTH}`}>{input.length}/{MAX_QUESTION_LENGTH}</span></div></form>
  </div>;
}
