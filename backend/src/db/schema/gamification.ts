// Schéma Drizzle — gamification (Phase 9 bis).
//
// Tables :
//   * `leaderboard_optin` : consentement opt-in par utilisateur
//     (v2 §9.5 — « pseudonyme, opt-in, scope hebdo »).
//   * `user_xp_snapshot` : snapshot hebdo des XP/streak pour
//     alimenter le leaderboard sans recalculer à chaque requête.
//     Insertion = début de chaque semaine ISO. Lecture = le
//     classement courant.
//   * `badge_unlocks` : badges débloqués (pour la collection côté
//     mobile, cf. UI badges Phase 9 bis).
//
// Toutes les tables sont indexées par `user_id` (et `week_iso` pour
// le snapshot) pour des lectures O(log n).
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/// Opt-in pour le leaderboard. L'utilisateur choisit un
/// pseudonyme (validé côté API : 3..20 caractères, alphanum).
export const leaderboardOptin = pgTable(
  'leaderboard_optin',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pseudonym: text('pseudonym').notNull(),
    /// Faculté (pour la segmentation du leaderboard).
    faculty: text('faculty'),
    /// Niveau d'étude (idem).
    studyYear: integer('study_year'),
    optInAt: timestamp('opt_in_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /// Pour la révocation RGPD (droit à l'effacement, v2 §13).
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    userUnique: uniqueIndex('leaderboard_optin_user_unique').on(t.userId),
    pseudonymIdx: index('leaderboard_optin_pseudonym_idx').on(t.pseudonym),
  }),
);

/// Snapshot hebdo des XP/streak. Une ligne par user par semaine ISO.
/// Permet de calculer le leaderboard sans toucher aux `review_logs`.
export const userXpSnapshot = pgTable(
  'user_xp_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /// Semaine ISO, format `YYYY-Www` (ex. `2025-W42`).
    weekIso: text('week_iso').notNull(),
    xpWeek: integer('xp_week').notNull().default(0),
    cardsReviewed: integer('cards_reviewed').notNull().default(0),
    mockExams: integer('mock_exams').notNull().default(0),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userWeekUnique: uniqueIndex('user_xp_snapshot_user_week_unique').on(
      t.userId,
      t.weekIso,
    ),
    weekIdx: index('user_xp_snapshot_week_idx').on(t.weekIso, t.xpWeek),
  }),
);

/// Badges débloqués par un utilisateur.
export const badgeUnlocks = pgTable(
  'badge_unlocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /// ID du badge (cf. `gamification_constants.dart` côté mobile).
    badgeId: text('badge_id').notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /// Snapshot du contexte au moment du déblocage (pour la timeline
    /// de collection, v2 §9.4).
    context: jsonb('context').notNull().default({}),
  },
  (t) => ({
    userBadgeUnique: uniqueIndex('badge_unlocks_user_badge_unique').on(
      t.userId,
      t.badgeId,
    ),
    userIdx: index('badge_unlocks_user_idx').on(t.userId, t.unlockedAt),
  }),
);
