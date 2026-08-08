import { supabase } from './supabase';
import { applyExpReward, type LevelProgress } from './characterStages';
import type { User } from './types';

const MAX_ATTEMPTS = 3;

// EXP/레벨 저장을 "지금 값을 읽고 → 계산해서 → 그대로 덮어쓰기"로 하면, 두 곳(다른 탭이나
// 기기)에서 거의 동시에 저장할 때 나중에 끝난 쪽이 앞의 보상을 조용히 지워버릴 수 있다.
// update의 WHERE에 읽었던 level/exp 값을 같이 걸어서, 그 사이에 값이 바뀌었으면 이 update가
// 아무 행도 바꾸지 못하게(=실패로 감지) 만들고, 최신 값을 다시 읽어 재계산 후 재시도한다.
export async function awardExpSafely(user: User, reward: number, extraUpdate?: (current: User) => Partial<User>): Promise<LevelProgress | null> {
  let current = user;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const progress = applyExpReward(current.character_level, current.character_exp, reward);
    const { data, error } = await supabase
      .from('users')
      .update({
        character_level: progress.level,
        character_exp: progress.exp,
        character_stage: progress.stage,
        ...(extraUpdate?.(current) ?? {}),
      })
      .eq('id', current.id)
      .eq('character_level', current.character_level)
      .eq('character_exp', current.character_exp)
      .select()
      .single();
    if (!error && data) return progress;
    const { data: fresh, error: fetchError } = await supabase.from('users').select().eq('id', current.id).single();
    if (fetchError || !fresh) return null;
    current = fresh as User;
  }
  return null;
}
