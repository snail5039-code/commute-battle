'use client';

import { X } from 'lucide-react';
import { STAGE_NAMES, STAGE_RING_CLASS, type CharacterStage } from '@/lib/characterStages';
import { useSelectedPetId, type PetId } from '@/lib/petCatalog';
import CharacterIcon from './CharacterIcon';

export default function EvolutionCelebration({ level, stage, evolved, onClose, petId }: { level: number; stage: CharacterStage; evolved: boolean; onClose: () => void; petId?: PetId }) {
  const fallbackPetId = useSelectedPetId();
  const resolvedPetId = petId ?? fallbackPetId;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={evolved ? '진화 축하' : '레벨업 축하'}>
    <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-8 text-center shadow-2xl motion-safe:animate-[celebrate-in_.45s_ease-out]">
      <button type="button" onClick={onClose} aria-label="닫기" className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
      <div className={`mx-auto grid size-24 place-items-center rounded-full bg-amber-50 motion-safe:animate-[celebrate-bounce_.8s_ease-in-out_infinite] ${STAGE_RING_CLASS[stage]}`}>
        <CharacterIcon stage={stage} petId={resolvedPetId} size={46} strokeWidth={1.6} />
      </div>
      <p className="mt-5 text-sm font-bold text-blue-600">{evolved ? '새로운 모습으로 진화!' : '한 단계 더 성장!'}</p>
      <h2 className="mt-1 text-2xl font-black text-slate-900">Lv.{level} · {STAGE_NAMES[stage]}</h2>
      <p className="mt-2 text-sm text-slate-500">오늘의 출근 기록이 멋진 성장이 되었어요.</p>
      <style jsx>{`@keyframes celebrate-in{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}@keyframes celebrate-bounce{50%{transform:translateY(-7px) rotate(5deg)}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`}</style>
    </div>
  </div>;
}
