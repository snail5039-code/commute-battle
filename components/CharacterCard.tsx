'use client';

import { Egg, Sprout, Swords, Crown } from 'lucide-react';
import { User } from '@/lib/types';

interface CharacterCardProps {
  user: User;
}

const STAGE_NAMES: Record<string, string> = {
  alg: '알',
  seedling: '새싹전사',
  warrior: '출근용사',
  veteran: '베테랑 직장인',
};

const STAGE_ICONS: Record<string, typeof Egg> = {
  alg: Egg,
  seedling: Sprout,
  warrior: Swords,
  veteran: Crown,
};

const NEXT_EVOLUTION: Record<string, string> = {
  alg: 'Lv.5',
  seedling: 'Lv.10',
  warrior: 'Lv.20',
  veteran: '최종 진화',
};

export default function CharacterCard({ user }: CharacterCardProps) {
  const stageName = STAGE_NAMES[user.character_stage];
  const StageIcon = STAGE_ICONS[user.character_stage];
  const expNeeded = user.character_level * 20;
  const expPercent = Math.min((user.character_exp / expNeeded) * 100, 100);

  return (
    <div className="card p-6 h-full flex flex-col justify-center">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-b from-blue-50 to-blue-100 flex items-center justify-center shrink-0 ring-1 ring-black/[0.04] text-blue-500">
          <StageIcon size={24} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold text-neutral-900 tracking-tight">
              {stageName}
            </h2>
            <span className="text-[13px] font-medium text-neutral-400">
              Lv.{user.character_level}
            </span>
          </div>

          <div className="mt-2.5 w-full bg-neutral-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${expPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[12px] text-neutral-400 mt-1.5">
            <span>
              EXP {user.character_exp}/{expNeeded}
            </span>
            <span>다음 진화 {NEXT_EVOLUTION[user.character_stage]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
