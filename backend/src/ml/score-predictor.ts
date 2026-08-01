// ScorePredictor — Phase 20.3 : prédiction du score au prochain
// examen blanc, modèle EXPLICABLE (logistique à coefficients documentés).
//
// Principes non négociables :
//   * explicable (v2 §13) : chaque prédiction rend ses features et ses
//     coefficients versionnés — pas de boîte noire ;
//   * k-anonymat : en dessous de MIN_REVIEWS revues sur 30 j, on refuse
//     de prédire (statistiquement indéfendable ET pas assez de signal) ;
//   * aucune donnée ne sort : calcul 100 % local sur agrégats déjà
//     présents en base (mock par défaut, jamais de service ML externe) ;
//   * coefficients gelés par MODEL_VERSION — toute évolution = entrée
//     de changelog + ré-évaluation offline (tools/ml_eval.py).

export const SCORE_MODEL_VERSION = 'v1.0.0';

/// Coefficients de la régression logistique (intercept + poids).
/// Signe attendu, vérifié par les tests : tout coefficient de feature
/// positive est ≥ 0. Calibrés sur cohorte synthétique (ml_eval.py) à
/// partir de la grille documentée dans PHASE_20_3_RAPPORT.md.
export const SCORE_COEFFICIENTS = {
  intercept: -1.2,
  accuracy30d: 2.6, // précision sur 30 j (0..1)
  coverageRatio: 1.1, // couverture du corpus actif (0..1)
  matureRatio: 0.8, // part des cartes matures (S > 21 j) dans les revues 30 j
  logStreak: 0.3, // log1p(streak en jours, plafonné à 30)
} as const;

/// Seuils de décision (changlogués).
export const SCORE_THRESHOLDS = {
  /// Signal minimum pour prédire (k-anonymat + sens statistique).
  MIN_REVIEWS_30D: 50,
  /// Bandes d'interprétation documentées.
  BAND_LOW_MAX: 55, // %  < 55  → 'low'
  BAND_HIGH_MIN: 70, // % ≥ 70 → 'high', sinon 'medium'
  MAX_STREAK_DAYS: 30,
} as const;

export interface ScoreFeatures {
  /// Revues sur la fenêtre de 30 jours (garde-fou k-anonymat).
  reviews30d: number;
  /// Précision (good+easy/total) sur 30 j, dans [0,1].
  accuracy30d: number;
  /// Couverture : cartes distinctes révisées / cartes actives du scope.
  coverageRatio: number;
  /// Part des revues sur cartes matures (stabilité > 21 j), dans [0,1].
  matureRatio: number;
  /// Streak courant en jours (plafonné pour éviter les outliers).
  streakDays: number;
}

export type ScoreBand = 'low' | 'medium' | 'high';

export type ScorePrediction =
  | {
      predictible: true;
      scorePercent: number; // 0..100 arrondi à 0.1
      band: ScoreBand;
      /// Écart-type approximatif (modèle logistique simple).
      marginPercent: number;
      modelVersion: string;
      features: ScoreFeatures;
    }
  | {
      predictible: false;
      reason: string;
      modelVersion: string;
      features: ScoreFeatures;
    };

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export class ScorePredictor {
  /// Prédiction — pure, déterministe (même features → même score).
  static predict(features: ScoreFeatures): ScorePrediction {
    const f: ScoreFeatures = {
      ...features,
      accuracy30d: clamp01(features.accuracy30d),
      coverageRatio: clamp01(features.coverageRatio),
      matureRatio: clamp01(features.matureRatio),
      streakDays: Math.min(
        Math.max(0, features.streakDays),
        SCORE_THRESHOLDS.MAX_STREAK_DAYS,
      ),
    };

    if (f.reviews30d < SCORE_THRESHOLDS.MIN_REVIEWS_30D) {
      return {
        predictible: false,
        reason:
          `signal insuffisant : ${f.reviews30d} revues sur 30 j ` +
          `(minimum ${SCORE_THRESHOLDS.MIN_REVIEWS_30D} pour une prédiction fiable)`,
        modelVersion: SCORE_MODEL_VERSION,
        features: f,
      };
    }

    const c = SCORE_COEFFICIENTS;
    const z =
      c.intercept +
      c.accuracy30d * f.accuracy30d +
      c.coverageRatio * f.coverageRatio +
      c.matureRatio * f.matureRatio +
      c.logStreak * Math.log1p(f.streakDays);
    const p = sigmoid(z);

    // Marge heuristique : ~p(1-p) (max en 0.5) — plus la prédiction
    // est extrême, plus la marge est étroite.
    const margin = 25 * (p * (1 - p)) * 4;

    const scorePercent = Math.round(p * 1000) / 10;
    const band: ScoreBand =
      scorePercent < SCORE_THRESHOLDS.BAND_LOW_MAX
        ? 'low'
        : scorePercent < SCORE_THRESHOLDS.BAND_HIGH_MIN
          ? 'medium'
          : 'high';

    return {
      predictible: true,
      scorePercent,
      band,
      marginPercent: Math.round(margin * 10) / 10,
      modelVersion: SCORE_MODEL_VERSION,
      features: f,
    };
  }
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
