// DTO — POST /v1/ai/voice-to-card (Phase 18.3).
import { z } from 'zod';
import type { LlmLang } from '../llm/llm.types';

/// L'étudiant envoie SOIT la transcription (STT côté client — chemin
/// préféré, pas d'upload audio), SOIT l'audio en base64 (transcription
/// serveur via le TranscriberProvider configuré).
export const VoiceToCardBody = z
  .object({
    deck_id: z.string().uuid(),
    lang: z.enum(['fr', 'ar', 'en']).default('fr'),
    /// ~7,5 Mo max (10 M caractères base64) — une dictée reste courte.
    audio_base64: z.string().min(100).max(10_000_000).optional(),
    audio_transcript: z.string().min(3).max(2_000).optional(),
  })
  .strict()
  .refine((b) => b.audio_base64 != null || b.audio_transcript != null, {
    message: 'audio_base64 ou audio_transcript requis',
  });
export type VoiceToCardBody = z.infer<typeof VoiceToCardBody>;

export interface VoiceToCardResponse {
  job_id: string;
  draft_id: string;
  transcript: string;
  formatted: { front: string; back: string; rule: string };
  transcriber: { provider: string; model: string; confidence: number };
  lang: LlmLang;
  remaining_quota_today: number;
  next_step: string;
}
