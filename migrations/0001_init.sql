-- EATIMING 초기 스키마 (Cloudflare D1 / SQLite)
-- 모든 시각은 UTC ISO-8601 문자열로 저장하고, 표시·날짜 계산은 사용자 시간대(users.timezone)로 처리한다.
-- D1에는 RLS가 없으므로 접근 제어는 Worker API 계층(worker/access.ts)에서 서버 측으로 강제한다.

PRAGMA foreign_keys = ON;

-- ───────── 계정 ─────────
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  privacy_agreed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  email TEXT NOT NULL COLLATE NOCASE,
  attempted_at TEXT NOT NULL
);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, attempted_at);

-- ───────── 약물 ─────────
-- schedule_type: 'interval'(마운자로처럼 N일 주기 투여) | 'daily'(콘서타처럼 매일 복용)
CREATE TABLE medications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('interval', 'daily')),
  interval_days INTEGER CHECK (interval_days IS NULL OR interval_days BETWEEN 1 AND 60),
  default_time TEXT CHECK (default_time IS NULL OR default_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  effect_hours REAL CHECK (effect_hours IS NULL OR (effect_hours > 0 AND effect_hours <= 48)),
  dose_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_medications_user ON medications(user_id);

-- 투여·복용 기록. 사용자의 명시적 입력으로만 생성된다(자동 생성 없음).
CREATE TABLE medication_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  taken_at TEXT NOT NULL,
  dose_label TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_medication_logs_med ON medication_logs(medication_id, taken_at DESC);
CREATE INDEX idx_medication_logs_user ON medication_logs(user_id, taken_at DESC);

-- 개인 체감 패턴: 투여 후 N일차에 본인이 느끼는 식욕 억제 체감 (약효·혈중농도가 아님)
CREATE TABLE perceived_patterns (
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_offset INTEGER NOT NULL CHECK (day_offset BETWEEN 0 AND 60),
  level TEXT NOT NULL CHECK (level IN ('strongest', 'strong', 'normal', 'weak', 'weakest')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (medication_id, day_offset)
);

-- ───────── 현재 식사 컨디션 ─────────
-- symptoms: 추후 메스꺼움·조기 포만감·속쓰림 등 세부 증상 확장용 JSON 배열
CREATE TABLE meal_conditions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('light', 'normal', 'hearty')),
  symptoms TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

-- ───────── 공통 음식 DB (서비스 관리) ─────────
CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  form_category TEXT NOT NULL,
  cuisine TEXT NOT NULL,
  base_status TEXT NOT NULL CHECK (base_status IN ('easy', 'depends', 'heavy')),
  fat_level INTEGER NOT NULL CHECK (fat_level BETWEEN 1 AND 3),
  spice_level INTEGER NOT NULL CHECK (spice_level BETWEEN 1 AND 3),
  tags TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE food_aliases (
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  PRIMARY KEY (food_id, alias)
);

CREATE TABLE food_variants (
  id TEXT PRIMARY KEY,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('easy', 'depends', 'heavy')),
  fat_level INTEGER NOT NULL CHECK (fat_level BETWEEN 1 AND 3),
  note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_food_variants_food ON food_variants(food_id);

-- ───────── 개인 음식 반응 ─────────
CREATE TABLE food_reactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES food_variants(id) ON DELETE SET NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('good', 'ok', 'bad')),
  eaten_at TEXT NOT NULL,
  medication_context TEXT NOT NULL DEFAULT '[]',
  condition_state TEXT CHECK (condition_state IS NULL OR condition_state IN ('light', 'normal', 'hearty')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_food_reactions_user_food ON food_reactions(user_id, food_id, eaten_at DESC);

-- ───────── 동반자 공유 ─────────
CREATE TABLE companion_invites (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  share_condition INTEGER NOT NULL DEFAULT 1,
  share_med_progress INTEGER NOT NULL DEFAULT 0,
  share_med_schedule INTEGER NOT NULL DEFAULT 0,
  share_reactions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TEXT,
  revoked_at TEXT
);
CREATE INDEX idx_companion_invites_owner ON companion_invites(owner_id);

-- 공유 관계와 항목별 권한. 행이 삭제되면 즉시 접근이 차단된다.
CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_condition INTEGER NOT NULL DEFAULT 1,
  share_med_progress INTEGER NOT NULL DEFAULT 0,
  share_med_schedule INTEGER NOT NULL DEFAULT 0,
  share_reactions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_id, viewer_id),
  CHECK (owner_id <> viewer_id)
);
CREATE INDEX idx_shares_viewer ON shares(viewer_id);
