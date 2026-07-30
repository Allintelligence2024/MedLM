/// Schéma Drizzle — Phase 18 (IA).
///
/// `ai_generation_jobs` : audit *complet* de toute production assistée
/// par IA (qui a généré quoi, quand, avec quel provider/modèle, combien
/// de tokens). Non négociable pour la conformité (doc v2 §13) et pour
/// le contrôle des coûts si un LLM payant est branché un jour.
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { cards } from './content';

export const aiGenerationJobs = pgTable(
  'ai_generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /// 'llm_generate' | 'voice_to_card' | 'tutor_ask'
    kind: text('kind').notNull(),
    /// 'ok' | 'failed' — les jobs en échec ne consomment pas le quota.
    status: text('status').notNull().default('ok'),
    provider: text('provider').notNull().default('mock'),
    model: text('model').notNull().default('mock-fsm-1'),
    /// SHA-256 du prompt/source : traçabilité sans stocker le brut.
    promptHash: text('prompt_hash'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    /// Cartes (brouillons) produites par ce job.
    cardIds: uuid('card_ids').array().notNull().default([]),
    meta: jsonb('meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userKindIdx: index('ai_jobs_user_kind_idx').on(t.userId, t.kind, t.createdAt),
    kindIdx: index('ai_jobs_kind_idx').on(t.kind, t.createdAt),
  }),
);

/// Phase 18.4 — signaux de difficulté remontés aux auteurs.
/// Un signal 'open' par carte maximum (unicité partielle côté SQL,
/// migration 0013 : `WHERE status='open'`).
export const aiDifficultySignals = pgTable(
  'ai_difficulty_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    /// 'repeated_lapses' (extensible : 'ambiguous_wording', …)
    reason: text('reason').notNull(),
    affectedUsers: integer('affected_users').notNull().default(0),
    totalLapses: integer('total_lapses').notNull().default(0),
    windowDays: integer('window_days').notNull().default(30),
    /// 'open' | 'resolved' | 'ignored'
    status: text('status').notNull().default('open'),
    createdBy: text('created_by').notNull().default('adaptive-engine'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id),
  },
  (t) => ({
    statusIdx: index('ai_signals_status_idx').on(t.status, t.createdAt),
    cardIdx: index('ai_signals_card_idx').on(t.cardId),
  }),
);

/// Phase 18.5 — alertes de décrochage envoyées (anti-spam : on ne
/// consigne que les notifications réellement parties).
export const retentionAlerts = pgTable(
  'retention_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /// 'gentle' | 'streak_broken' | 'reengagement'
    level: text('level').notNull(),
    /// Nombre de notifications poussées (1 par appareil notifié).
    channels: integer('channels').notNull().default(0),
    notifiedAt: timestamp('notified_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index('retention_alerts_user_idx').on(t.userId, t.notifiedAt),
    levelIdx: index('retention_alerts_level_idx').on(t.level, t.notifiedAt),
  }),
);
