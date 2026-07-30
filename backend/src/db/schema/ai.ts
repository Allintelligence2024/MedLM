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
