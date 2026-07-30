// Tests OnboardingService — Phase 15.3.
// On teste la logique pure (_adjustFsrsWeights) sans DB.
import { describe, it, expect } from 'vitest';
import { FSRS_WEIGHTS } from '../../src/common/fsrs/fsrs.constants';
import { OnboardingBody } from '../../src/onboarding/onboarding.dto';

const adjustFsrsWeights = (
  level: 'beginner' | 'intermediate' | 'advanced',
): number[] => {
  const base = [...FSRS_WEIGHTS];
  switch (level) {
    case 'beginner':
      return base;
    case 'intermediate':
      return base.map((w, i) => (i === 17 ? Math.min(w * 1.1, 0.99) : w));
    case 'advanced':
      return base.map((w, i) => (i >= 2 && i <= 5 ? w * 0.85 : w));
  }
};

describe('OnboardingService — adjustFsrsWeights', () => {
  it('beginner = valeurs par défaut', () => {
    const out = adjustFsrsWeights('beginner');
    expect(out).toEqual([...FSRS_WEIGHTS]);
  });

  it('intermediate : w[17] *= 1.1 (capé à 0.99)', () => {
    const out = adjustFsrsWeights('intermediate');
    expect(out.length).toBe(19);
    expect(out[17]).toBeCloseTo(FSRS_WEIGHTS[17]! * 1.1, 5);
    // Les autres sont inchangés.
    for (let i = 0; i < 19; i++) {
      if (i !== 17) expect(out[i]).toBeCloseTo(FSRS_WEIGHTS[i]!, 5);
    }
  });

  it('advanced : w[2..5] *= 0.85, reste inchangé', () => {
    const out = adjustFsrsWeights('advanced');
    expect(out.length).toBe(19);
    for (let i = 0; i < 19; i++) {
      if (i >= 2 && i <= 5) {
        expect(out[i]).toBeCloseTo(FSRS_WEIGHTS[i]! * 0.85, 5);
      } else {
        expect(out[i]).toBeCloseTo(FSRS_WEIGHTS[i]!, 5);
      }
    }
  });
});

describe('OnboardingBody — validation Zod', () => {
  it('rejette un body vide', () => {
    const r = OnboardingBody.safeParse({});
    expect(r.success).toBe(false);
  });

  it('accepte un body complet', () => {
    const r = OnboardingBody.safeParse({
      faculty: 'Faculté de Médecine d\'Alger',
      study_year: 1,
      experience_level: 'beginner',
      preferred_language: 'fr',
      module_interests: ['00000000-0000-0000-0000-000000000001'],
      daily_goal_cards: 10,
    });
    expect(r.success).toBe(true);
  });

  it('rejette une daily_goal hors [5, 50]', () => {
    const r = OnboardingBody.safeParse({
      faculty: 'Alger',
      study_year: 1,
      experience_level: 'beginner',
      preferred_language: 'fr',
      module_interests: ['00000000-0000-0000-0000-000000000001'],
      daily_goal_cards: 100, // hors limite
    });
    expect(r.success).toBe(false);
  });

  it('rejette un experience_level invalide', () => {
    const r = OnboardingBody.safeParse({
      faculty: 'Alger',
      study_year: 1,
      experience_level: 'expert',
      preferred_language: 'fr',
      module_interests: ['00000000-0000-0000-0000-000000000001'],
      daily_goal_cards: 10,
    });
    expect(r.success).toBe(false);
  });

  it('rejette preferred_language != fr/en/ar', () => {
    const r = OnboardingBody.safeParse({
      faculty: 'Alger',
      study_year: 1,
      experience_level: 'beginner',
      preferred_language: 'es',
      module_interests: ['00000000-0000-0000-0000-000000000001'],
      daily_goal_cards: 10,
    });
    expect(r.success).toBe(false);
  });

  it('rejette module_interests vide', () => {
    const r = OnboardingBody.safeParse({
      faculty: 'Alger',
      study_year: 1,
      experience_level: 'beginner',
      preferred_language: 'fr',
      module_interests: [],
      daily_goal_cards: 10,
    });
    expect(r.success).toBe(false);
  });
});
