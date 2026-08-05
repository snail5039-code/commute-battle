import { supabase } from './supabase';
import { isCommuteOnTime, isReturnOnTime } from './onTime';
import { getExpNeeded, getStageForLevel } from './characterStages';
import { CommuteRecord, User } from './types';

export async function recordArrival(
  user: User,
  records: CommuteRecord[],
  activeRecord: CommuteRecord
) {
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

  let newLevel = user.character_level;
  let newExp = user.character_exp + expGained;
  while (newExp >= getExpNeeded(newLevel)) {
    newExp -= getExpNeeded(newLevel);
    newLevel += 1;
  }
  const newStage = getStageForLevel(newLevel);

  await supabase
    .from('users')
    .update({
      character_level: newLevel,
      character_exp: newExp,
      character_stage: newStage,
      total_commute_arrivals: (user.total_commute_arrivals || 0) + 1,
    })
    .eq('id', user.id);
}
