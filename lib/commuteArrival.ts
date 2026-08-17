import { isCommuteOnTime, isReturnOnTime } from './onTime';
import { type LevelProgress } from './characterStages';
import { CommuteRecord, User } from './types';
import { awardExpSafely } from './expReward';
import { finishAttendance, recordInstantAttendance } from './attendance';

export async function recordArrival(
  user: User,
  records: CommuteRecord[],
  activeRecord: CommuteRecord
): Promise<LevelProgress> {
  const arrivedAt = new Date();
  const start = new Date(activeRecord.start_time!);

  // 지각 여부는 근무 스케줄이 기기에만 있어서 아직 여기서 계산합니다. 경험치 계산에만 쓰이고,
  // 도착 시각과 이동 시간은 서버가 찍은 값을 그대로 씁니다.
  const onTime =
    activeRecord.type === 'commute'
      ? isCommuteOnTime(records, arrivedAt)
      : isReturnOnTime(records, start);

  const finished = await finishAttendance(activeRecord.id, onTime);
  const expGained = finished.exp_gained;

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
  const created = await recordInstantAttendance(type);
  const expGained = created.exp_gained;

  const progress = await awardExpSafely(user, expGained, (current) => ({
    total_commute_arrivals: type === 'commute' ? (current.total_commute_arrivals || 0) + 1 : current.total_commute_arrivals,
  }));
  if (!progress) throw new Error('Failed to update character EXP');

  return progress;
}
