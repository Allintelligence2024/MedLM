// Types pour les signaux de difficulté IA (Phase 19.5 — endpoint 18.4).
//
// Miroir de la réponse GET /v1/ai/adaptive/signals (les alias Drizzle
// du SELECT sont sérialisés en camelCase).

export type SignalStatus = 'open' | 'resolved' | 'ignored';

export interface DifficultySignal {
  id: string;
  cardId: string;
  /// Raison du signal (aujourd'hui : 'repeated_lapses').
  reason: string;
  affectedUsers: number;
  totalLapses: number;
  windowDays: number;
  status: SignalStatus;
  createdAt: string;
}

export interface SignalsListResponse {
  status: SignalStatus;
  signals: DifficultySignal[];
}

export interface SignalsScanResponse {
  window_days: number;
  min_lapses_per_user: number;
  min_affected_users: number;
  candidate_cards: number;
  new_signals: number;
  skipped_existing: number;
}
