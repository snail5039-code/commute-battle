CREATE TABLE users (
  id TEXT PRIMARY KEY,
  home_address TEXT,
  work_address TEXT,
  character_level INT DEFAULT 1,
  character_exp INT DEFAULT 0,
  character_stage TEXT DEFAULT 'alg',
  total_commute_starts INT DEFAULT 0,
  total_commute_arrivals INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE commute_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('commute', 'early_leave', 'vacation', 'sick', 'absence')),
  commute_subtype TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration_minutes INT,
  is_on_time BOOLEAN DEFAULT FALSE,
  weather_condition TEXT,
  exp_gained INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
  -- 하루에 여러 번 출근/퇴근 가능 (재출근 등) 하도록 user_id+date+type UNIQUE 제약 없음
);

CREATE TABLE badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  badge_name TEXT NOT NULL,
  progress_current INT DEFAULT 0,
  progress_total INT,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, badge_name)
);

CREATE INDEX idx_commute_records_user_date ON commute_records(user_id, date);
CREATE INDEX idx_badges_user ON badges(user_id);
