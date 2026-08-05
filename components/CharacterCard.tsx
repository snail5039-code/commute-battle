'use client';

import { User } from '@/lib/types';
import { getExpNeeded, NEXT_EVOLUTION } from '@/lib/characterStages';
import { PET_CATALOG, PET_IDS, storePetId, useSelectedPetId, type PetId } from '@/lib/petCatalog';
import CharacterIcon from './CharacterIcon';

interface CharacterCardProps {
  user: User;
  selectedPetId?: PetId;
  onPetChange?: (petId: PetId) => void;
}

export default function CharacterCard({ user, selectedPetId, onPetChange }: CharacterCardProps) {
  const fallbackPetId = useSelectedPetId();
  const petId = selectedPetId ?? fallbackPetId;
  const pet = PET_CATALOG[petId];
  const expNeeded = getExpNeeded(user.character_level);
  const expPercent = Math.min((user.character_exp / expNeeded) * 100, 100);

  const selectPet = (nextPetId: PetId) => {
    storePetId(nextPetId);
    onPetChange?.(nextPetId);
  };

  return (
    <div className="card p-5 h-full flex flex-col justify-center">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 ring-1 ring-black/[0.04]" style={{ backgroundColor: pet.softColor }}>
          <CharacterIcon stage={user.character_stage} petId={petId} size={28} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0"><h2 className="text-[15px] font-semibold text-neutral-900 truncate">{pet.name} · {pet.stageNames[user.character_stage]}</h2><p className="text-[11px] text-neutral-400 truncate">{pet.personality}</p></div>
            <span className="text-[13px] font-medium text-neutral-400 shrink-0">Lv.{user.character_level}</span>
          </div>
          <div className="mt-2.5 w-full bg-neutral-100 rounded-full h-1.5" role="progressbar" aria-label={`${pet.name} 경험치`} aria-valuemin={0} aria-valuemax={expNeeded} aria-valuenow={Math.min(user.character_exp, expNeeded)}>
            <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${expPercent}%`, backgroundColor: pet.color }} />
          </div>
          <div className="flex justify-between text-[12px] text-neutral-400 mt-1.5"><span>EXP {user.character_exp}/{expNeeded}</span><span>다음 진화 {NEXT_EVOLUTION[user.character_stage]}</span></div>
        </div>
      </div>
      <fieldset className="mt-4 border-0 p-0">
        <legend className="sr-only">함께할 펫 선택</legend>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="함께할 펫 선택">
          {PET_IDS.map((id) => {
            const option = PET_CATALOG[id];
            const selected = id === petId;
            return <button key={id} type="button" role="radio" aria-checked={selected} aria-label={`${option.name}, ${option.personality}`} title={`${option.name} · ${option.personality}`} onClick={() => selectPet(id)} className={`min-h-10 rounded-xl border flex items-center justify-center transition-colors ${selected ? 'border-neutral-700 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50'}`}><CharacterIcon stage={user.character_stage} petId={id} size={20} /></button>;
          })}
        </div>
      </fieldset>
    </div>
  );
}
