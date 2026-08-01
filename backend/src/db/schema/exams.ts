// Schéma Drizzle — exams (Phase 10).
//
// `exam_questions` lie une question à une carte (via `examQuestionId`).
// Quand l'étudiant rate une question, on injecte la carte dans
// le SRS. C'est la mécanique prévue par la v2 §10.
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { cards } from './content';

export const examAttempts = pgTable(
  'exam_attempts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    status: text('status').notNull().default('in_progress'),
    score: real('score'),
    correctCount: integer('correct_count'),
    incorrectCount: integer('incorrect_count'),
    unansweredCount: integer('unanswered_count'),
  },
  (t) => ({
    userIdx: index('exam_attempts_user_idx').on(t.userId, t.startedAt),
    templateIdx: index('exam_attempts_template_idx').on(t.templateId),
    /// Une seule tentative « active » par user/template — empêche les
    /// doubles starts. PARTIEL (status = 'in_progress') : on peut
    /// repasser le même sujet une fois soumis. Migration 0016.
    activeUnique: uniqueIndex('exam_attempts_active_unique')
      .on(t.userId, t.templateId)
      .where(sql`status = 'in_progress'`),
  }),
);

export const examQuestions = pgTable(
  'exam_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id').notNull(),
    /// Référence à la carte SRS associée (FK optionnelle — la
    /// réinjection ne fonctionne que si la carte existe).
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
    position: integer('position').notNull(),
    /// Options proposées à l'étudiant. `is_correct` est un bool
    /// PRIVÉ : jamais envoyé à l'app avant la soumission.
    options: jsonb('options').notNull().$type<Array<{ id: string; fr: string; en?: string; is_correct: boolean }>>(),
    isMultiple: boolean('is_multiple').notNull().default(false),
  },
  (t) => ({
    templateIdx: index('exam_questions_template_idx').on(t.templateId, t.position),
  }),
);

export const examAnswers = pgTable(
  'exam_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id').notNull().references(() => examAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id').notNull().references(() => examQuestions.id, { onDelete: 'cascade' }),
    selected: jsonb('selected').notNull().$type<string[]>(),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    attemptIdx: index('exam_answers_attempt_idx').on(t.attemptId, t.questionId),
  }),
);
