'use client';

import { Bird, Cat, Crown, Dog, Rabbit, Shield, Sparkles, Sprout, Turtle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { STAGE_ICON_SCALE, type CharacterStage } from '@/lib/characterStages';
import { DEFAULT_PET_ID, PET_CATALOG, type PetId } from '@/lib/petCatalog';

const PET_ICONS: Record<PetId, LucideIcon> = { cat: Cat, dog: Dog, rabbit: Rabbit, bird: Bird, turtle: Turtle };
const STAGE_BADGES: Record<CharacterStage, LucideIcon> = { alg: Sparkles, seedling: Sprout, warrior: Shield, veteran: Crown };

export default function CharacterIcon({ stage, petId = DEFAULT_PET_ID, size = 20, className, strokeWidth = 2, title, accessoryEmoji }: {
  stage: CharacterStage;
  petId?: PetId;
  size?: number;
  className?: string;
  strokeWidth?: number;
  title?: string;
  accessoryEmoji?: string;
}) {
  const PetIcon = PET_ICONS[petId];
  const StageBadge = STAGE_BADGES[stage];
  const pet = PET_CATALOG[petId];
  const accessibleName = title ?? `${pet.name} ${pet.stageNames[stage]}`;

  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ''}`} style={{ width: size, height: size, color: pet.color }} role="img" aria-label={accessibleName}>
      <PetIcon size={Math.round(size * STAGE_ICON_SCALE[stage])} strokeWidth={strokeWidth} aria-hidden="true" />
      <StageBadge aria-hidden="true" size={Math.max(9, Math.round(size * 0.42))} strokeWidth={2.5} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white" />
      {accessoryEmoji && (
        <span aria-hidden="true" className="absolute -top-1 -right-1 leading-none drop-shadow-sm" style={{ fontSize: Math.max(9, Math.round(size * 0.5)) }}>
          {accessoryEmoji}
        </span>
      )}
    </span>
  );
}
