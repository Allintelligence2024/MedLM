/// Schéma Drizzle — contenu (programmes, modules, decks, cartes, signalements).
///
/// Réplique du schéma v2 §7 : la carte est un JSONB bilingue. C'est
/// volontaire : PostgreSQL sait indexer du JSONB, et on garde la
/// flexibilité d'ajouter des champs côté CMS sans migration de schéma.
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/// Programme (ex. « PCEM1 Alger »).
export const programmes = pgTable('programmes', {
  id: uuid('id').primaryKey().defaultRandom(),
  nameFr: text('name_fr').notNull(),
  nameEn: text('name_en').notNull().default(''),
  country: text('country').notNull(),
  studyYear: integer('study_year').notNull(),
});

/// Module (ex. « Anatomie »).
export const modules = pgTable(
  'modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programmeId: uuid('programme_id').notNull().references(() => programmes.id, { onDelete: 'cascade' }),
    nameFr: text('name_fr').notNull(),
    nameEn: text('name_en').notNull().default(''),
    orderIndex: integer('order_index').notNull().default(0),
    isPremium: boolean('is_premium').notNull().default(true),
  },
  (t) => ({
    programmeIdx: index('modules_programme_idx').on(t.programmeId),
  }),
);

/// Deck (ex. « Membre supérieur »).
export const decks = pgTable(
  'decks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
    nameFr: text('name_fr').notNull(),
    nameEn: text('name_en').notNull().default(''),
    descriptionFr: text('description_fr').notNull().default(''),
    isPremium: boolean('is_premium').notNull().default(true),
    version: integer('version').notNull().default(1),
    cardCount: integer('card_count').notNull().default(0),
    coverImageKey: text('cover_image_key'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => ({
    moduleIdx: index('decks_module_idx').on(t.moduleId),
    versionIdx: index('decks_version_idx').on(t.version),
  }),
);

/// Carte — JSONB bilingue + métadonnées de provenance obligatoires.
export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deckId: uuid('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    status: text('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    /// Contenu bilingue : { front, back, explanation, media[] }
    content: jsonb('content').notNull(),
    /// Provenance et licence : { source_type, faculty, year, attribution, ... }
    sourceMeta: jsonb('source_meta').notNull().default({}),
    tags: text('tags').array().notNull().default([]),
    difficultyHint: integer('difficulty_hint'),
    isPremium: boolean('is_premium').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /// Phase 10 : lien optionnel vers une question d'examen. Si la
    /// carte est ratée à un exam, on la réinjecte dans le SRS.
    examQuestionId: uuid('exam_question_id'),
  },
  (t) => ({
    deckStatusIdx: index('cards_deck_status_idx').on(t.deckId, t.status, t.version),
    tagsIdx: index('cards_tags_idx').using('gin', t.tags),
    contentIdx: index('cards_content_idx').using('gin', t.content),
  }),
);

/// Signalements d'erreur (par les étudiants).
export const cardReports = pgTable(
  'card_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    comment: text('comment').notNull().default(''),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cardIdx: index('card_reports_card_idx').on(t.cardId),
    userIdx: index('card_reports_user_idx').on(t.userId),
  }),
);

/// Historique des versions d'une carte (audit trail, §5.3 v2).
export const cardVersions = pgTable(
  'card_versions',
  {
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    contentSnapshot: jsonb('content_snapshot').notNull(),
    changedBy: uuid('changed_by').references(() => users.id),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.cardId, t.version] }),
  }),
);
