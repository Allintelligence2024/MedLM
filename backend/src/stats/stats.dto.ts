// DTOs Stats utilisateur (Phase 15.2).
import { z } from 'zod';

/// Query : période pour les stats.
export const StatsQuery = z.object({
  /// Période : 'day' (24h), 'week' (7j), 'month' (30j), 'all'.
  /// Défaut : 'all' (cumul depuis l'inscription).
  period: z.enum(['day', 'week', 'month', 'all']).default('all'),
});
export type StatsQuery = z.infer<typeof StatsQuery>;

/// Réponse : statistiques utilisateur pour la période.
export interface UserStats {
  user_id: string;
  period: 'day' | 'week' | 'month' | 'all';
  /// Cartes révisées sur la période.
  cards_reviewed: number;
  /// Cartes correctes du premier coup (rating >= 3).
  cards_correct: number;
  /// Taux de réussite (0..1).
  accuracy: number;
  /// Temps total passé (ms).
  total_duration_ms: number;
  /// Temps moyen par carte (ms).
  avg_duration_ms: number;
  /// Nombre de sessions.
  sessions_count: number;
  /// Mock exams passés sur la période.
  mock_exams_count: number;
  /// Score moyen des mock exams (0..1).
  mock_exams_avg_score: number;
  /// Streak actuel (jours).
  current_streak: number;
  /// Plus long streak jamais atteint.
  longest_streak: number;
  /// XP total (toutes périodes).
  xp_total: number;
  /// Niveau courant (P1/P2/Interne/Résident/Praticien).
  level: string;
  /// Cartes par état (new, learning, review, relearning).
  cards_by_state: Record<string, number>;
  /// Top 5 decks par cartes révisées.
  top_decks: Array<{ deck_id: string; deck_name: string; cards: number }>;
  /// Leechs (cartes avec lapses >= 8, cf. v2 §4).
  leech_count: number;
  /// Distribution des ratings (1, 2, 3, 4).
  rating_distribution: Record<string, number>;
  /// Prédit la prochaine révision (delta en jours, basé sur la
  /// médiane des scheduled_days des cartes dues).
  forecast_next_review_days: number;
  /// Date du snapshot.
  computed_at: string;
}
