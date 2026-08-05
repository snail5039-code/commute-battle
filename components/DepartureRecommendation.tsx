import { Clock3, ShieldCheck } from 'lucide-react';
import { DepartureRecommendation as Recommendation } from '@/lib/weather';

export default function DepartureRecommendation({ recommendation, compact = false }: { recommendation: Recommendation; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-indigo-100 bg-indigo-50/70 ${compact ? 'p-3' : 'p-3.5'}`}>
      <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700"><Clock3 size={14} />추천 출발</span><strong className="text-lg text-indigo-950">{recommendation.departureTime}</strong></div>
      <p className="mt-1 text-[10px] text-indigo-700">예상 이동 {recommendation.tripMinutes}분 + 안전 여유 {recommendation.bufferMinutes}분</p>
      {!compact && <ul className="mt-2 space-y-1">{recommendation.reasons.map((reason) => <li key={reason} className="flex gap-1.5 text-[10px] text-slate-600"><ShieldCheck size={11} className="mt-0.5 shrink-0 text-indigo-500" />{reason}</li>)}</ul>}
    </div>
  );
}
