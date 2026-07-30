-- Migration 0005 — gamification (Phase 9 bis).
--
-- Tables :
--   * leaderboard_optin : opt-in par utilisateur (pseudonyme).
--   * user_xp_snapshot : snapshot hebdo des XP/streak.
--   * badge_unlocks     : badges débloqués (collection).
--
-- Toutes idempotentes (IF NOT EXISTS).

-- ── leaderboard_optin ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaderboard_optin (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pseudonym   TEXT NOT NULL,
  faculty     TEXT,
  study_year  INTEGER,
  opt_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_optin_user_unique
  ON leaderboard_optin (user_id);
CREATE INDEX IF NOT EXISTS leaderboard_optin_pseudonym_idx
  ON leaderboard_optin (pseudonym);

-- ── user_xp_snapshot ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_xp_snapshot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_iso        TEXT NOT NULL,
  xp_week         INTEGER NOT NULL DEFAULT 0,
  cards_reviewed  INTEGER NOT NULL DEFAULT 0,
  mock_exams      INTEGER NOT NULL DEFAULT 0,
  snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_xp_snapshot_user_week_unique
  ON user_xp_snapshot (user_id, week_iso);
CREATE INDEX IF NOT EXISTS user_xp_snapshot_week_idx
  ON user_xp_snapshot (week_iso, xp_week);

-- ── badge_unlocks ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS badge_unlocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id     TEXT NOT NULL,
  unlocked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  context      JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS badge_unlocks_user_badge_unique
  ON badge_unlocks (user_id, badge_id);
CREATE INDEX IF NOT EXISTS badge_unlocks_user_idx
  ON badge_unlocks (user_id, unlocked_at);
