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
