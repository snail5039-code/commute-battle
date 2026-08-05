'use client';

import { Egg, Sprout, Swords, Crown } from 'lucide-react';

const ICON_MAP: Record<string, typeof Egg> = {
  alg: Egg,
  seedling: Sprout,
  warrior: Swords,
  veteran: Crown,
};

export default function CharacterIcon({
  stage,
  size = 20,
  className,
  strokeWidth,
}: {
  stage: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = ICON_MAP[stage] || Egg;
  return <Icon size={size} className={className} strokeWidth={strokeWidth} />;
}
