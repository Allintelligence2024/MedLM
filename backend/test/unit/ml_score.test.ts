// Tests Phase 20.3 — prédiction explicable + focus par tag (pur).
import { describe, it, expect } from 'vitest';
import {
  ScorePredictor,
  SCORE_COEFFICIENTS,
  SCORE_MODEL_VERSION,
  SCORE_THRESHOLDS,
  ScoreFeatures,
} from '../../src/ml/score-predictor';
import {
  TagAdjustments,
  TAG_ADJUST_THRESHOLDS,
} from '../../src/ml/tag-adjustments';

function baseFeatures(over: Partial<ScoreFeatures> = {}): ScoreFeatures {
  return {
    reviews30d: 200,
    accuracy30d: 0.75,
    coverageRatio: 0.6,
    matureRatio: 0.4,
    streakDays: 10,
    ...over,
  };
}

describe('ScorePredictor', () => {
  it('déterministe : mêmes features → même score', () => {
    const a = ScorePredictor.predict(baseFeatures());
    const b = ScorePredictor.predict(baseFeatures());
    expect(a).toEqual(b);
  });

  it('toujours dans [0, 100], marge positive, version exposée', () => {
    for (const acc of [0, 0.2, 0.5, 0.8, 1]) {
      const p = ScorePredictor.predict(baseFeatures({ accuracy30d: acc }));
      expect(p.predictible).toBe(true);
      if (p.predictible) {
        expect(p.scorePercent).toBeGreaterThanOrEqual(0);
        expect(p.scorePercent).toBeLessThanOrEqual(100);
        expect(p.marginPercent).toBeGreaterThan(0);
        expect(p.modelVersion).toBe(SCORE_MODEL_VERSION);
      }
    }
  });

  it('monotone dans chaque feature (coefficients positifs)', () => {
    const scores = (f: Partial<ScoreFeatures>) => {
      const p = ScorePredictor.predict(baseFeatures(f));
      return p.predictible ? p.scorePercent : -1;
    };
    expect(scores({ accuracy30d: 0.9 })).toBeGreaterThan(
      scores({ accuracy30d: 0.5 }),
    );
    expect(scores({ coverageRatio: 0.9 })).toBeGreaterThan(
      scores({ coverageRatio: 0.2 }),
    );
    expect(scores({ matureRatio: 0.8 })).toBeGreaterThan(
      scores({ matureRatio: 0.1 }),
    );
    expect(scores({ streakDays: 25 })).toBeGreaterThan(
      scores({ streakDays: 1 }),
    );
  });

  it('k-anonymat : refus documenté sous le seuil de revues', () => {
    const p = ScorePredictor.predict(
      baseFeatures({ reviews30d: SCORE_THRESHOLDS.MIN_REVIEWS_30D - 1 }),
    );
    expect(p.predictible).toBe(false);
    if (!p.predictible) {
      expect(p.reason).toContain('signal insuffisant');
      expect(p.modelVersion).toBe(SCORE_MODEL_VERSION);
    }
  });

  it('bandes cohérentes avec les seuils', () => {
    // Une bande se joue sur TOUTES les features réunies (le modèle
    // additionne les contributions) : avec les autres features au
    // niveau médian de baseFeatures, baisser seulement accuracy ne
    // suffit pas à tomber sous BAND_LOW_MAX — c'est le comportement
    // calibré (ml_eval.py). On teste donc des profils cohérents.
    const bandOf = (over: Partial<ScoreFeatures>) => {
      const p = ScorePredictor.predict(baseFeatures(over));
      return p.predictible ? p.band : null;
    };
    expect(
      bandOf({ accuracy30d: 0.99, coverageRatio: 0.99, matureRatio: 0.99, streakDays: 30 }),
    ).toBe('high');
    expect(
      bandOf({ accuracy30d: 0.05, coverageRatio: 0.05, matureRatio: 0.05, streakDays: 0 }),
    ).toBe('low');
    // Profil médian réaliste : contribution positive mais modérée.
    expect(
      bandOf({ accuracy30d: 0.45, coverageRatio: 0.2, matureRatio: 0.05, streakDays: 0 }),
    ).toBe('medium');
  });

  it('bornes défensives : NaN et valeurs hors [0,1] clampées', () => {
    const p = ScorePredictor.predict(
      baseFeatures({
        accuracy30d: Number.NaN,
        coverageRatio: 5,
        matureRatio: -2,
        streakDays: 10_000,
      }),
    );
    expect(p.predictible).toBe(true);
    if (p.predictible) {
      expect(p.features.accuracy30d).toBe(0);
      expect(p.features.coverageRatio).toBe(1);
      expect(p.features.matureRatio).toBe(0);
      expect(p.features.streakDays).toBe(SCORE_THRESHOLDS.MAX_STREAK_DAYS);
    }
  });

  it('coefficients versionnés et signés', () => {
    expect(SCORE_MODEL_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(SCORE_COEFFICIENTS.accuracy30d).toBeGreaterThan(0);
    expect(SCORE_COEFFICIENTS.coverageRatio).toBeGreaterThan(0);
    expect(SCORE_COEFFICIENTS.matureRatio).toBeGreaterThan(0);
    expect(SCORE_COEFFICIENTS.logStreak).toBeGreaterThan(0);
    expect(SCORE_COEFFICIENTS.intercept).toBeLessThan(0);
  });
});

describe('TagAdjustments', () => {
  it('focus : tags à fort échec avec signal suffisant, triés', () => {
    const { focus } = TagAdjustments.suggest([
      { tag: 'cardio', reviews: 60, lapses: 30 }, // 50 %
      { tag: 'neuro', reviews: 40, lapses: 16 }, // 40 %
      { tag: 'rare', reviews: TAG_ADJUST_THRESHOLDS.MIN_TAG_REVIEWS - 1, lapses: 18 },
    ]);
    expect(focus.map((f) => f.tag)).toEqual(['cardio', 'neuro']);
    expect(focus[0]!.reason).toContain('50%');
  });

  it('relax : maîtrise démontrée avec double condition', () => {
    const { relax } = TagAdjustments.suggest([
      { tag: 'anat', reviews: 80, lapses: 4 }, // 5 % ✓
      { tag: 'peu-revu', reviews: 30, lapses: 1 }, // < RELAX_MIN_REVIEWS → non
    ]);
    expect(relax.map((r) => r.tag)).toEqual(['anat']);
  });

  it('échantillon insuffisant → aucune suggestion', () => {
    const { focus, relax } = TagAdjustments.suggest([
      { tag: 'x', reviews: 5, lapses: 5 },
    ]);
    expect(focus).toHaveLength(0);
    expect(relax).toHaveLength(0);
  });

  it('cap à MAX_SUGGESTIONS par catégorie', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      tag: `t${i}`,
      reviews: 100,
      lapses: 60,
    }));
    expect(TagAdjustments.suggest(many).focus).toHaveLength(
      TAG_ADJUST_THRESHOLDS.MAX_SUGGESTIONS,
    );
  });

  it('reviews=0 ne produit jamais NaN', () => {
    const { focus, relax } = TagAdjustments.suggest([
      { tag: 'z', reviews: 0, lapses: 0 },
    ]);
    expect(focus).toHaveLength(0);
    expect(relax).toHaveLength(0);
  });
});
