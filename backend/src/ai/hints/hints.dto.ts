// Hints DTO — Phase 18.1.
import { z } from 'zod';
import type { HintCategory, HintLang } from './hint-templates';

/// Query string optionnelle : ?lang=fr|ar|en pour forcer la langue
/// (sinon la préférence utilisateur `users.lang_pref` s'applique).
export const HintQuery = z
  .object({
    lang: z.enum(['fr', 'ar', 'en']).optional(),
  })
  .strict();
export type HintQuery = z.infer<typeof HintQuery>;

/// Réponse de GET /v1/ai/hints/:cardId.
export interface HintResponse {
  card_id: string;
  category: HintCategory;
  /// Texte du hint, déjà localisé.
  hint: string;
  lang: HintLang;
  experience_level: 'beginner' | 'intermediate' | 'advanced';
  /// false si à terme on sert un hint générique mis en cache ; aujourd'hui
  /// tous les hints sont calculés sur le profil réel → toujours true.
  personalized: boolean;
  /// Justification explicable (doc v2 §13) — signaux utilisés.
  based_on: string[];
  generated_at: string;
}
