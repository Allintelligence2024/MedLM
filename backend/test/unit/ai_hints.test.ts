// Tests Phase 18.1 — Hints adaptatifs (logique pure, sans DB).
// On importe les vraies fonctions du service/templates : la couverture
// mesurée en CI reflète le code de production, pas une copie.
import { describe, it, expect } from 'vitest';
import { HintsService, HINT_THRESHOLDS } from '../../src/ai/hints/hints.service';
import {
  HINT_TEMPLATES,
  buildRationale,
  renderHint,
  type HintContext,
} from '../../src/ai/hints/hint-templates';
import { HintQuery } from '../../src/ai/hints/hints.dto';

const CTX: HintContext = {
  anchor: 'nerf radial',
  lapses: 5,
  reps: 2,
  overdueDays: 7,
  difficulty: 8.2,
  experience: 'intermediate',
};

// ── deriveExperience ────────────────────────────────────────────────
describe('HintsService.deriveExperience', () => {
  it('0 revue → beginner', () => {
    expect(HintsService.deriveExperience({ totalReps: 0, lapseRate: 0 })).toBe('beginner');
  });

  it('juste sous le seuil → beginner', () => {
    expect(
      HintsService.deriveExperience({
        totalReps: HINT_THRESHOLDS.EXPERIENCE_BEGINNER_MAX_REPS - 1,
        lapseRate: 0,
      }),
    ).toBe('beginner');
  });

  it('au seuil → intermediate', () => {
    expect(
      HintsService.deriveExperience({
        totalReps: HINT_THRESHOLDS.EXPERIENCE_BEGINNER_MAX_REPS,
        lapseRate: 0,
      }),
    ).toBe('intermediate');
  });

  it('≥500 revues ET lapses < 25 % → advanced', () => {
    expect(
      HintsService.deriveExperience({ totalReps: 500, lapseRate: 0.2 }),
    ).toBe('advanced');
  });

  it('≥500 revues MAIS lapses ≥ 25 % → intermediate', () => {
    expect(
      HintsService.deriveExperience({
        totalReps: 500,
        lapseRate: HINT_THRESHOLDS.EXPERIENCE_ADVANCED_MAX_LAPSE_RATE,
      }),
    ).toBe('intermediate');
  });
});

// ── normalizeTags / pickAnchor ──────────────────────────────────────
describe('HintsService.normalizeTags', () => {
  it('minuscule, trim, déduponnage', () => {
    expect(HintsService.normalizeTags(['  Nerf Radial ', 'nerf radial', 'Muscle'])).toEqual([
      'nerf radial',
      'muscle',
    ]);
  });

  it('rejette les tags de moins de 2 caractères, plafonne à 8', () => {
    const many = ['a', 'b', ...Array.from({ length: 12 }, (_, i) => `tag-${i}`)];
    const out = HintsService.normalizeTags(many);
    expect(out.length).toBe(8);
    expect(out).not.toContain('a');
  });
});

describe('HintsService.pickAnchor', () => {
  it('ignore les tags génériques', () => {
    expect(HintsService.pickAnchor(['anatomie', 'pcem1', 'nerf radial'])).toBe('nerf radial');
  });

  it('fallback si tous génériques', () => {
    expect(HintsService.pickAnchor(['anatomie'], 'Membre supérieur')).toBe('Membre supérieur');
  });

  it('fallback par défaut', () => {
    expect(HintsService.pickAnchor([])).toBe('cette notion');
  });
});

// ── selectHintCategory : priorités ─────────────────────────────────
describe('HintsService.selectHintCategory', () => {
  const base = {
    state: 'review',
    lapses: 0,
    isLeech: false,
    reps: 10,
    hasExamLink: false,
    difficulty: 5,
    difficultyHint: null as number | null,
    overdueDays: 0,
    experience: 'intermediate' as const,
  };

  it('leech (isLeech) a la priorité absolue, même avec un lien examen', () => {
    expect(
      HintsService.selectHintCategory({ ...base, isLeech: true, hasExamLink: true }),
    ).toBe('leech_help');
  });

  it('lapses ≥ seuil → leech_help', () => {
    expect(
      HintsService.selectHintCategory({
        ...base,
        lapses: HINT_THRESHOLDS.LEECH_HELP_MIN_LAPSES,
      }),
    ).toBe('leech_help');
  });

  it('carte new + débutant → first_encounter', () => {
    expect(
      HintsService.selectHintCategory({ ...base, state: 'new', reps: 0, experience: 'beginner' }),
    ).toBe('first_encounter');
  });

  it('carte new + avancé → PAS first_encounter (descend aux règles suivantes)', () => {
    expect(
      HintsService.selectHintCategory({ ...base, state: 'new', reps: 0, experience: 'advanced' }),
    ).toBe('memory_anchor');
  });

  it('lien examen avant difficulté', () => {
    expect(
      HintsService.selectHintCategory({
        ...base,
        hasExamLink: true,
        difficulty: 9,
        overdueDays: 10,
      }),
    ).toBe('exam_link');
  });

  it('difficulté FSRS élevée → difficulty_high', () => {
    expect(
      HintsService.selectHintCategory({
        ...base,
        difficulty: HINT_THRESHOLDS.DIFFICULTY_HIGH_FSRS,
      }),
    ).toBe('difficulty_high');
  });

  it('hint éditorial ≥ 4 → difficulty_high', () => {
    expect(
      HintsService.selectHintCategory({ ...base, difficultyHint: 4 }),
    ).toBe('difficulty_high');
  });

  it('difficulté avant retard de révision', () => {
    expect(
      HintsService.selectHintCategory({ ...base, difficulty: 8, overdueDays: 30 }),
    ).toBe('difficulty_high');
  });

  it('retard ≥ 3 jours → due_pressure', () => {
    expect(
      HintsService.selectHintCategory({
        ...base,
        overdueDays: HINT_THRESHOLDS.DUE_PRESSURE_MIN_DAYS,
      }),
    ).toBe('due_pressure');
  });

  it('1 à 3 passages → consolidation', () => {
    expect(HintsService.selectHintCategory({ ...base, reps: 1 })).toBe('consolidation');
    expect(
      HintsService.selectHintCategory({
        ...base,
        reps: HINT_THRESHOLDS.CONSOLIDATION_MAX_REPS,
      }),
    ).toBe('consolidation');
    expect(
      HintsService.selectHintCategory({
        ...base,
        reps: HINT_THRESHOLDS.CONSOLIDATION_MAX_REPS + 1,
      }),
    ).toBe('memory_anchor');
  });
});

// ── Rendu des templates (fr / ar / en) ─────────────────────────────
describe('renderHint — interpolation trilingue', () => {
  it('leech_help interpole lapses et ancre en fr', () => {
    const txt = renderHint('leech_help', CTX, 'fr');
    expect(txt).toContain('5 fois');
    expect(txt).toContain('nerf radial');
  });

  it('due_pressure interpole les jours de retard en en', () => {
    const txt = renderHint('due_pressure', CTX, 'en');
    expect(txt).toContain('7 days');
    expect(txt).toContain('nerf radial');
  });

  it('difficulty_high arrondit la difficulté en ar', () => {
    const txt = renderHint('difficulty_high', CTX, 'ar');
    expect(txt).toContain('8/10');
    expect(txt).toContain('nerf radial');
  });

  it('toutes les catégories ont les 3 langues non vides', () => {
    for (const [cat, byLang] of Object.entries(HINT_TEMPLATES)) {
      for (const lang of ['fr', 'ar', 'en'] as const) {
        const txt = (byLang[lang] ?? byLang.fr)(CTX);
        expect(txt.length, `${cat}/${lang} vide`).toBeGreaterThan(10);
      }
    }
  });

  it('fallback fr si langue absente (garde-fou)', () => {
    const txt = renderHint('memory_anchor', CTX, 'fr');
    expect(txt).toContain('nerf radial');
  });
});

// ── Justification explicable ────────────────────────────────────────
describe('buildRationale', () => {
  it('inclut catégorie + expérience + ancre', () => {
    const r = buildRationale('consolidation', CTX);
    expect(r).toContain('category:consolidation');
    expect(r).toContain('experience:intermediate');
    expect(r).toContain('anchor:nerf radial');
    expect(r).toContain('reps:2');
  });

  it('leech_help expose le nombre de lapses', () => {
    expect(buildRationale('leech_help', CTX)).toContain('lapses:5');
  });
});

// ── Validation Zod de la query ──────────────────────────────────────
describe('HintQuery — validation Zod', () => {
  it('query vide acceptée (lang par défaut)', () => {
    expect(HintQuery.safeParse({}).success).toBe(true);
  });

  it('lang valide acceptée', () => {
    expect(HintQuery.safeParse({ lang: 'ar' }).success).toBe(true);
  });

  it('lang invalide rejetée', () => {
    expect(HintQuery.safeParse({ lang: 'es' }).success).toBe(false);
  });

  it('clé inconnue rejetée (strict)', () => {
    expect(HintQuery.safeParse({ lang: 'fr', debug: true }).success).toBe(false);
  });
});
