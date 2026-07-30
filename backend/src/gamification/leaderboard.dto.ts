// DTOs du leaderboard (Phase 9 bis).
//
// Conformité v2 §9.5 :
//   * Opt-in explicite (pseudonyme obligatoire).
//   * Pseudonyme de 3..20 caractères, alphanumérique.
//   * Scope hebdo (week ISO).
//   * Faculté + année d'étude = segmentation.
//   * Pas d'email ni d'ID dans la réponse publique.
import { z } from 'zod';

/// Body : opt-in au leaderboard.
export const OptInBody = z.object({
  pseudonym: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'pseudonyme alphanumérique uniquement'),
  faculty: z.string().max(100).optional(),
  study_year: z.number().int().min(1).max(10).optional(),
});
export type OptInBody = z.infer<typeof OptInBody>;

/// Query : paramètres du GET /leaderboard.
export const LeaderboardQuery = z.object({
  /// Filtre par faculté (optionnel).
  faculty: z.string().max(100).optional(),
  /// Filtre par année d'étude (optionnel).
  study_year: z.coerce.number().int().min(1).max(10).optional(),
  /// Nombre max d'entrées (défaut 50, max 200).
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuery>;

/// Réponse d'une entrée de leaderboard (publique, pas d'user_id).
export interface LeaderboardEntry {
  rank: number;
  pseudonym: string;
  faculty: string | null;
  study_year: number | null;
  xp_week: number;
  cards_reviewed: number;
  mock_exams: number;
}

/// Réponse complète du GET /leaderboard.
export interface LeaderboardResponse {
  week_iso: string;
  total_entries: number;
  entries: LeaderboardEntry[];
  /// Rappel : si l'utilisateur courant est opt-in, son rang est
  /// ici. Sinon `null`.
  my_rank: number | null;
}
