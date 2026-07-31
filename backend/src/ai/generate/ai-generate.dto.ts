// DTO — POST /v1/content/ai-generate (Phase 18.2).
import { z } from 'zod';

/// L'instructeur soumet un texte source (PDF/syllabus pré-extrait
/// côté client ou CMS). Limites strictes : coût maîtrisé et injection
/// impossible via un document géant.
export const AiGenerateBody = z
  .object({
    deck_id: z.string().uuid(),
    source_text: z.string().min(50).max(20_000),
    title: z.string().min(3).max(200).optional(),
    count: z.number().int().min(1).max(20).default(5),
    lang: z.enum(['fr', 'ar', 'en']).default('fr'),
  })
  .strict();
export type AiGenerateBody = z.infer<typeof AiGenerateBody>;

export interface AiGenerateResponse {
  job_id: string;
  status: 'ok';
  deck_id: string;
  /// Brouillons créés (status='draft') : validation humaine OBLIGATOIRE
  /// via le workflow CMS existant (review → approved → published).
  created_draft_ids: string[];
  provider: string;
  model: string;
  tokens: { in: number; out: number };
  remaining_quota_today: number;
  next_step: string;
}
