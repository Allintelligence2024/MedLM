// Schéma Drizzle — exam_templates + exam_attempt_events (Phase 10 bis).
//
// `exam_templates` : un sujet paramétré (module, nb questions, durée,
// barème par faculté). C'est ce qu'on génère à la volée quand un
// étudiant démarre un mock exam.
//
// `exam_attempt_events` : journal anti-triche. Chaque interaction
// (focus loss, paste, switch d'onglet) est tracée. Append-only.
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { modules } from './content';
import { examAttempts } from './exams';

/// Template d'examen — paramétrable par faculté/année.
export const examTemplates = pgTable(
  'exam_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nameFr: text('name_fr').notNull(),
    nameEn: text('name_en'),
    /// Module ciblé (FK). Si NULL, le sujet est multi-module.
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    /// Faculté cible — pour le barème spécifique (v2 §10).
    faculty: text('faculty'),
    /// Année d'étude cible.
    studyYear: integer('study_year'),
    /// Nb total de questions.
    totalQuestions: integer('total_questions').notNull().default(20),
    /// Durée en minutes.
    durationMinutes: integer('duration_minutes').notNull().default(30),
    /// Barème custom : pondération par question (1.0 par défaut).
    /// Si la question i a un weight = 2.0, elle compte double dans
    /// le score final.
    weights: jsonb('weights').notNull().$type<Record<string, number>>().default({}),
    /// Seuil de validation (0..1, défaut 0.5 = 50%).
    passThreshold: text('pass_threshold').notNull().default('0.5'),
    /// Actif ?
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    moduleIdx: index('exam_templates_module_idx').on(t.moduleId),
    facultyIdx: index('exam_templates_faculty_idx').on(t.faculty, t.studyYear),
  }),
);

/// Journal anti-triche — append-only.
export const examAttemptEvents = pgTable(
  'exam_attempt_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id').notNull().references(() => examAttempts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /// Type d'événement (focus_loss, paste, switch_tab, etc.).
    kind: text('kind').notNull(),
    /// Métadonnées libres (durée du focus loss, longueur du paste...).
    metadata: jsonb('metadata').notNull().default({}),
    /// Timestamp côté client (avec tolérance).
    clientTs: bigint('client_ts', { mode: 'number' }).notNull(),
    /// Timestamp côté serveur (source de vérité).
    serverTs: timestamp('server_ts', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    attemptIdx: index('exam_attempt_events_attempt_idx').on(t.attemptId, t.serverTs),
    kindIdx: index('exam_attempt_events_kind_idx').on(t.kind, t.serverTs),
  }),
);

// NOTE : l'index unique partiel « une tentative active par user/template »
// vit désormais dans le callback de la table `exam_attempts`
// (schema/exams.ts) + migration 0016. Déclarer un index standalone sur
// des colonnes d'une autre table crashait au chargement
// (`defaultConfig` undefined → JSON.parse(undefined)).
