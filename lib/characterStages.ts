export const CHARACTER_STAGES = ['alg', 'seedling', 'warrior', 'veteran'] as const;

export type CharacterStage = (typeof CHARACTER_STAGES)[number];

export const STAGE_NAMES: Record<CharacterStage, string> = {
  alg: '알',
  seedling: '새싹 용사',
  warrior: '출근 전사',
  veteran: '베테랑 직장인',
};

// 기존 stage/exp 값은 그대로 두고, 앞으로 얻는 경험치에만 적용할 수 있는 완만한 성장 규칙이다.
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
  // 종전 level * 20보다 초반 요구량을 낮추며, 저장된 잔여 exp 형식은 유지한다.
  return Math.max(10, 8 + Math.max(1, level) * 4);
}

export function getStageForLevel(level: number): CharacterStage {
  if (level >= 10) return 'veteran';
  if (level >= 6) return 'warrior';
  if (level >= 3) return 'seedling';
  return 'alg';
}
