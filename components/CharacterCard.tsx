'use client';

import Link from 'next/link';
import { ChevronRight, LockKeyhole } from 'lucide-react';
import { CommuteRecord, User } from '@/lib/types';
import { getBadgeSummary } from '@/lib/badges';
import { getExpNeeded, NEXT_EVOLUTION, STAGE_RING_CLASS } from '@/lib/characterStages';
import { getAccessoryById, isAccessoryUnlocked, PET_CATALOG, PET_IDS, storePetId, useEquippedAccessoryId, useSelectedPetId, type PetId } from '@/lib/petCatalog';
import { readQuestLedger } from '@/lib/quests';
import BadgeIcon from './BadgeIcon';
import CharacterIcon from './CharacterIcon';

interface CharacterCardProps {
  user: User;
  records: CommuteRecord[];
  selectedPetId?: PetId;
  onPetChange?: (petId: PetId) => void;
}

export default function CharacterCard({ user, records, selectedPetId, onPetChange }: CharacterCardProps) {
  const fallbackPetId = useSelectedPetId();
  const petId = selectedPetId ?? fallbackPetId;
  const pet = PET_CATALOG[petId];
  const expNeeded = getExpNeeded(user.character_level);
  const expPercent = Math.min((user.character_exp / expNeeded) * 100, 100);
  const { progress, completed: badgeCount, total: badgeTotal } = getBadgeSummary(records);
  const upNext = progress.filter((item) => !item.completed).sort((a, b) => b.percent - a.percent || a.badge.target - b.badge.target).slice(0, 3);

  const equippedAccessoryId = useEquippedAccessoryId();
  const equippedAccessory = getAccessoryById(equippedAccessoryId);
  const completedBadges = new Set(progress.filter((item) => item.completed).map((item) => item.badge.key));
  const completedQuests = new Set(readQuestLedger().claimKeys.map((key) => key.split(':')[0]));
  const accessoryEmoji = equippedAccessory && isAccessoryUnlocked(equippedAccessory, user.character_level, completedBadges, completedQuests) ? equippedAccessory.emoji : undefined;

  const selectPet = (nextPetId: PetId) => {
    storePetId(nextPetId);
    onPetChange?.(nextPetId);
  };

  return (
    <div className="card h-full p-5">
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 transition-shadow ${STAGE_RING_CLASS[user.character_stage]}`} style={{ backgroundColor: pet.softColor }}>
          <CharacterIcon stage={user.character_stage} petId={petId} size={28} strokeWidth={1.75} accessoryEmoji={accessoryEmoji} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0"><h2 className="text-[15px] font-semibold text-neutral-900 truncate">{pet.name} · {pet.stageNames[user.character_stage]}</h2><p className="text-[11px] text-neutral-400 truncate">{pet.personality}</p></div>
            <span className="flex items-center gap-2 shrink-0"><span className="text-[11px] font-semibold text-blue-700">배지 {badgeCount}개</span><span className="text-[13px] font-medium text-neutral-400">Lv.{user.character_level}</span></span>
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

      <section className="mt-4 border-t border-slate-100 pt-4" aria-labelledby="pet-badge-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="pet-badge-title" className="text-xs font-bold text-slate-800">배지 도전</h3>
            <p className="mt-0.5 text-[10px] text-slate-400">펫과 함께 다음 배지를 모아 보세요</p>
          </div>
          <Link href="/badges" className="flex shrink-0 items-center text-[11px] font-semibold text-blue-600" aria-label={`배지 ${badgeCount}/${badgeTotal}, 전체 보기`}>
            {badgeCount} / {badgeTotal}<ChevronRight size={13} />
          </Link>
        </div>

        <div className="mt-3 grid gap-2.5">
          {upNext.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-3 text-center text-[11px] font-medium text-amber-700">모든 배지를 해금했어요!</p>
          ) : upNext.map(({ badge, displayed, percent, revealed }) => (
            <div key={badge.key} className="flex min-w-0 items-center gap-2.5">
              <div className={`grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${revealed ? 'bg-indigo-50 text-indigo-600 ring-indigo-100' : 'bg-slate-100 text-slate-400 ring-slate-200'}`}>
                {revealed ? <BadgeIcon icon={badge.icon} size={14} /> : <LockKeyhole size={13} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <p className="truncate font-semibold text-slate-700">{revealed ? badge.name : '비밀 배지'}</p>
                  <span className="shrink-0 text-[10px] text-slate-400">{displayed}/{badge.target}{badge.unit}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500" style={{ width: `${percent}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
