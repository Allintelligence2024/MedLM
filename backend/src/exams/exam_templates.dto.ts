// DTOs Exam Templates (Phase 10 bis).
import { z } from 'zod';

export const ListTemplatesQuery = z.object({
  module_id: z.string().uuid().optional(),
  faculty: z.string().max(100).optional(),
  study_year: z.coerce.number().int().min(1).max(10).optional(),
});
export type ListTemplatesQuery = z.infer<typeof ListTemplatesQuery>;

/// Body d'opt-in d'un événement anti-triche.
export const CheatEventBody = z.object({
  kind: z.enum([
    'focus_loss',
    'focus_gain',
    'paste',
    'copy',
    'switch_tab',
    'right_click',
    'screenshot',
  ]),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  client_ts: z.number().int().nonnegative(),
});
export type CheatEventBody = z.infer<typeof CheatEventBody>;

/// Réponse avec score pondéré.
export interface WeightedScoring {
  totalQuestions: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  /// Score pondéré (0..1).
  weighted_score: number;
  /// Score brut (0..1), sans pondération.
  raw_score: number;
  /// Pourcentage affiché (0..100).
  pct: number;
  pass: boolean;
  /// Détail des pondérations appliquées (pour audit).
  weights_applied: Record<string, number>;
}
