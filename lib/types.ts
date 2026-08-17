export interface User {
  id: string;
  username?: string;
  nickname?: string;
  home_address?: string;
  work_address?: string;
  character_level: number;
  character_exp: number;
  character_stage: 'alg' | 'seedling' | 'warrior' | 'veteran';
  total_commute_starts: number;
  total_commute_arrivals: number;
  created_at: string;
  updated_at: string;
}

export interface CommuteRecord {
  id: string;
  user_id: string;
  date: string;
  type: 'commute' | 'return' | 'early_leave' | 'vacation' | 'sick' | 'absence';
  commute_subtype?: 'start' | 'arrival' | 'leave';
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  is_on_time: boolean;
  weather_condition?: string;
  exp_gained: number;
  // 위치 인증 결과. true=사업장 반경 안, false=미인증(관리자 확인 대상),
  // null=검증 대상 아님(사업장 좌표 미설정·재택·워크스페이스 없는 개인 기록)
  location_verified?: boolean | null;
  location_status?: string | null;
  location_distance_m?: number | null;
  location_accuracy_m?: number | null;
  location_checked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Badge {
  id: string;
  user_id: string;
  badge_name: string;
  progress_current: number;
  progress_total: number;
  is_completed: boolean;
  completed_at?: string;
  created_at: string;
}

export interface RouteGuideResponse {
  route: string;
  recommended_departure: string;
  difficulty: 'peaceful' | 'caution' | 'alert' | 'danger';
  message: string;
}

export interface CommuteState {
  status: 'idle' | 'started' | 'departed' | null;
  type?: 'commute' | 'return';
  start_time?: Date;
}

export type WorkdayMode = 'office' | 'remote' | 'off';

export interface WorkdayOverride {
  mode: WorkdayMode;
  startTime?: string;
  endTime?: string;
}

export interface WorkSchedule {
  startTime: string;
  endTime: string;
  overrides: Partial<Record<number, WorkdayOverride>>;
}
