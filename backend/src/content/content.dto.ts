import { z } from 'zod';

/// Query : lister les decks depuis une version.
export const ListDecksQuery = z.object({
  module_id: z.string().uuid().optional(),
  version_since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListDecksQuery = z.infer<typeof ListDecksQuery>;

/// Query : delta de cartes d'un deck.
export const DeckCardsQuery = z.object({
  version_since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type DeckCardsQuery = z.infer<typeof DeckCardsQuery>;

/// Body : signalement d'erreur.
export const ReportBody = z.object({
  reason: z.enum([
    'wrong_answer',
    'typo',
    'outdated',
    'missing_explanation',
    'other',
  ]),
  comment: z.string().max(2000).default(''),
});
export type ReportBody = z.infer<typeof ReportBody>;

/// Body : mise à jour d'une carte (Phase 11 bis).
export const UpdateCardBody = z.object({
  content: z.object({
    front_fr: z.string().min(1).max(2000),
    back_fr: z.string().min(1).max(4000),
    front_en: z.string().max(2000).optional(),
    back_en: z.string().max(4000).optional(),
    explanation_fr: z.string().max(4000).optional(),
    explanation_en: z.string().max(4000).optional(),
    media: z
      .array(
        z.object({
          url: z.string().url(),
          alt_text: z.string().max(500),
          type: z.enum(['image', 'audio', 'video']),
        }),
      )
      .default([]),
  }),
  source: z.object({
    type: z.enum(['original', 'inspired', 'partnership']),
    faculty: z.string().max(100).optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    can_distribute_offline: z.boolean(),
    license: z.string().max(200).optional(),
  }),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
});
export type UpdateCardBody = z.infer<typeof UpdateCardBody>;

/// Body : transition de workflow (Phase 11 bis).
export const TransitionBody = z.object({
  to: z.enum(['draft', 'review', 'approved', 'published', 'retired']),
  comment: z.string().max(500).optional(),
});
export type TransitionBody = z.infer<typeof TransitionBody>;

/// Body : presigned URL pour upload média (Phase 11 bis).
export const PresignBody = z.object({
  filename: z.string().min(1).max(200),
  content_type: z.string().min(1).max(100),
  size_bytes: z.number().int().positive().max(20 * 1024 * 1024),
});
export type PresignBody = z.infer<typeof PresignBody>;

/// Body : mise à jour d'un signalement.
export const UpdateReportBody = z.object({
  status: z.enum(['pending', 'investigating', 'resolved', 'dismissed']),
  comment: z.string().max(1000).optional(),
});
export type UpdateReportBody = z.infer<typeof UpdateReportBody>;
