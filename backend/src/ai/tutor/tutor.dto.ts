// DTO — POST /v1/ai/tutor/ask (Phase 18.6).
import { z } from 'zod';
import type { LlmLang } from '../llm/llm.types';

export const TutorAskBody = z
  .object({
    question: z.string().min(3).max(1000),
    lang: z.enum(['fr', 'ar', 'en']).default('fr'),
    /// Mémoire courte de la conversation (max 10 messages — le tuteur
    /// est un assistant de révision, pas un historique illimité).
    history: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict();
export type TutorAskBody = z.infer<typeof TutorAskBody>;

export interface TutorAskResponse {
  /// Réponse complète (urgence + corps + disclaimer en clôture).
  answer: string;
  /// Répété à part pour mise en avant UI — mais il est AUSSI dans
  /// `answer` (lecture TTS à voix haute).
  disclaimer: string;
  emergency: boolean;
  within_scope: boolean;
  provider: string;
  model: string;
  remaining_quota_today: number;
  lang?: LlmLang;
}
