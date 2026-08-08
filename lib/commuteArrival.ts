import { supabase } from './supabase';
import { isCommuteOnTime, isReturnOnTime } from './onTime';
import { type LevelProgress } from './characterStages';
import { CommuteRecord, User } from './types';
import { localDateKey } from './date';
import { awardExpSafely } from './expReward';

export async function recordArrival(
  user: User,
  records: CommuteRecord[],
  activeRecord: CommuteRecord
): Promise<LevelProgress> {
  const arrivedAt = new Date();
  const start = new Date(activeRecord.start_time!);
  const duration = Math.round((arrivedAt.getTime() - start.getTime()) / 60000);

  const onTime =
    activeRecord.type === 'commute'
      ? isCommuteOnTime(records, arrivedAt)
      : isReturnOnTime(records, start);

  const expGained = onTime ? 15 : 10;

  const { error } = await supabase
    .from('commute_records')
    .update({
      end_time: arrivedAt.toISOString(),
      commute_subtype: 'arrival',
      duration_minutes: duration,
      exp_gained: expGained,
      is_on_time: onTime,
      updated_at: arrivedAt.toISOString(),
    })
    .eq('id', activeRecord.id);

  if (error) throw error;

  const progress = await awardExpSafely(user, expGained, (current) => ({
    total_commute_arrivals:
      activeRecord.type === 'commute'
        ? (current.total_commute_arrivals || 0) + 1
        : current.total_commute_arrivals,
  }));
  if (!progress) throw new Error('Failed to update character EXP');

  return progress;
}

// 재택근무일에는 이동이 없으므로 출발/도착 단계를 나누지 않고 한 번에 완료 처리한다
// (집 컴퓨터 앞에 앉는 순간이 곧 출근/퇴근이므로 지각 판정도 적용하지 않는다).
export async function recordInstantTrip(
  user: User,
  type: 'commute' | 'return'
): Promise<LevelProgress> {
  const now = new Date();
  const today = localDateKey(now);
  const expGained = 15;

  const { error } = await supabase.from('commute_records').insert({
    user_id: user.id,
    date: today,
    type,
    commute_subtype: 'arrival',
    start_time: now.toISOString(),
    end_time: now.toISOString(),
    duration_minutes: 0,
    is_on_time: true,
    exp_gained: expGained,
  });

  if (error) throw error;

  const progress = await awardExpSafely(user, expGained, (current) => ({
    total_commute_arrivals: type === 'commute' ? (current.total_commute_arrivals || 0) + 1 : current.total_commute_arrivals,
  }));
  if (!progress) throw new Error('Failed to update character EXP');

  return progress;
}
