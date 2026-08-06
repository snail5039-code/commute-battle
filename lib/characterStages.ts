export const CHARACTER_STAGES = ['alg', 'seedling', 'warrior', 'veteran'] as const;

export type CharacterStage = (typeof CHARACTER_STAGES)[number];

export const STAGE_NAMES: Record<CharacterStage, string> = {
  alg: '알',
  seedling: '새싹 사원',
  warrior: '출근 전사',
  veteran: '베테랑 직장인',
};

export const EVOLUTION_LEVELS: Record<CharacterStage, number | null> = {
  alg: 3,
  seedling: 6,
  warrior: 10,
  veteran: null,
};

export const NEXT_EVOLUTION: Record<CharacterStage, string> = {
  alg: 'Lv.3',
  seedling: 'Lv.6',
  warrior: 'Lv.10',
  veteran: '최종 진화',
};

export function getExpNeeded(level: number): number {
  return Math.max(10, 8 + Math.max(1, level) * 4);
}

// 진화해도 캐릭터가 똑같아 보인다는 피드백 때문에 추가 — 단계마다 아이콘 크기와 링/글로우를
// 눈에 띄게 다르게 줘서 진화가 실제로 "달라 보이게" 한다.
export const STAGE_ICON_SCALE: Record<CharacterStage, number> = { alg: 0.7, seedling: 0.85, warrior: 1, veteran: 1.18 };
export const STAGE_RING_CLASS: Record<CharacterStage, string> = {
  alg: 'ring-1 ring-black/[0.06]',
  seedling: 'ring-2 ring-emerald-300',
  warrior: 'ring-2 ring-blue-400 shadow-[0_0_0_4px_rgba(59,130,246,0.16)]',
  veteran: 'ring-[3px] ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.6)]',
};

export function getStageForLevel(level: number): CharacterStage {
  if (level >= 10) return 'veteran';
  if (level >= 6) return 'warrior';
  if (level >= 3) return 'seedling';
  return 'alg';
}

export interface LevelProgress {
  level: number;
  exp: number;
  stage: CharacterStage;
  levelsGained: number;
  evolved: boolean;
}

/** Applies an EXP reward without changing the established per-level EXP curve. */
export function applyExpReward(level: number, exp: number, reward: number): LevelProgress {
  let nextLevel = Math.max(1, level);
  let nextExp = Math.max(0, exp) + Math.max(0, reward);
  const previousStage = getStageForLevel(nextLevel);
  while (nextExp >= getExpNeeded(nextLevel)) {
    nextExp -= getExpNeeded(nextLevel);
    nextLevel += 1;
  }
  const stage = getStageForLevel(nextLevel);
  return { level: nextLevel, exp: nextExp, stage, levelsGained: nextLevel - Math.max(1, level), evolved: stage !== previousStage };
}
