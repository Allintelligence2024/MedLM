/// Tests d'équivalence FSRS-5 Dart ↔ TypeScript.
///
/// Hypothèse directrice : les deux implémentations doivent produire le
/// **même** état pour le **même** journal d'événements, à la décimale près.
/// C'est la condition pour que la sync multi-plateforme converge (Phase 6
/// du plan d'implémentation, v2 §14).
///
/// On charge les golden scenarios produits par
/// `tools/generate_golden.py` (Phase 1) — c'est la source de vérité.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  CardState,
  CardType,
  DEFAULT_PARAMETERS,
  Rating,
  ReviewEvent,
  FSRS_WEIGHTS,
} from '../../src/common/fsrs/fsrs.constants';
import { FsrsEngine } from '../../src/common/fsrs/fsrs.engine';

const GOLDEN_PATH = resolve(__dirname, '../../../mobile/test/srs/golden_scenarios.json');

interface GoldenMath {
  retrievability: Array<{ elapsedDays: number; stability: number; expected: number }>;
  intervalFromStability: Array<{ stability: number; requestRetention: number; expected: number }>;
  initialStability: Array<{ rating: number; expected: number }>;
  initialDifficulty: Array<{ rating: number; expected: number }>;
}

interface GoldenScenario {
  name: string;
  description: string;
  cardType: string;
  steps: Array<{
    rating: number;
    ratingName: string;
    nowMs: number;
    state: string;
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    reps: number;
    lapses: number;
    isLeech: boolean;
    dueMs: number | null;
  }>;
}

interface GoldenRoot {
  weights: number[];
  t0: number;
  math: GoldenMath;
  scenarios: GoldenScenario[];
  fold: { events: Array<{ id: string; rating: number; reviewedAt: number; cardType: string; examMode: boolean }>; expected: { state: string; stability: number; difficulty: number; scheduledDays: number; reps: number; lapses: number } };
  previews: Array<{ name: string; probeMs: number; buildSteps: Array<{ rating: number; gapDays: number }>; intervals: { again: number; hard: number; good: number; easy: number } }>;
}

const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenRoot;
const engine = new FsrsEngine();

describe('Parité FSRS-5 Dart ↔ TypeScript', () => {
  it('les 19 poids sont identiques à la référence', () => {
    expect(FSRS_WEIGHTS).toHaveLength(19);
    for (let i = 0; i < 19; i++) {
      expect(FSRS_WEIGHTS[i]).toBeCloseTo(golden.weights[i]!, 1e-12);
    }
  });

  it('paramètres par défaut : rétention cible 0.9', () => {
    expect(DEFAULT_PARAMETERS.requestRetention).toBe(0.9);
  });

  it.each(golden.math.retrievability)(
    'retrievability(t=$elapsedDays, S=$stability)',
    (c) => {
      const actual = engine.retrievability(c.elapsedDays, c.stability);
      expect(actual).toBeCloseTo(c.expected, 1e-9);
    },
  );

  it.each(golden.math.intervalFromStability)(
    'intervalFromStability(S=$stability, r=$requestRetention)',
    (c) => {
      const e = new FsrsEngine({ ...DEFAULT_PARAMETERS, requestRetention: c.requestRetention });
      expect(e.intervalFromStability(c.stability)).toBeCloseTo(c.expected, 1e-9);
    },
  );

  it.each(golden.math.initialStability)(
    'stabilité initiale — note $rating',
    (c) => {
      const s = engine.applyReview(
        {
          state: CardState.New,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          lastReviewMs: null,
          dueMs: null,
          isLeech: false,
        },
        c.rating as Rating,
        0,
      );
      expect(s.stability).toBeCloseTo(c.expected, 1e-9);
    },
  );

  it.each(golden.math.initialDifficulty)(
    'difficulté initiale — note $rating',
    (c) => {
      const s = engine.applyReview(
        {
          state: CardState.New,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          lastReviewMs: null,
          dueMs: null,
          isLeech: false,
        },
        c.rating as Rating,
        0,
      );
      expect(s.difficulty).toBeCloseTo(c.expected, 1e-9);
    },
  );

  for (const scenario of golden.scenarios) {
    it(`scénario "${scenario.name}" — ${scenario.description}`, () => {
      let state = {
        state: CardState.New,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        lastReviewMs: null,
        dueMs: null,
        isLeech: false,
      };
      for (const step of scenario.steps) {
        state = engine.applyReview(
          state,
          step.rating as Rating,
          step.nowMs,
          scenario.cardType as CardType,
        );
        expect(state.state).toBe(step.state);
        expect(state.stability).toBeCloseTo(step.stability, 1e-6);
        expect(state.difficulty).toBeCloseTo(step.difficulty, 1e-6);
        expect(state.elapsedDays).toBe(step.elapsedDays);
        expect(state.scheduledDays).toBe(step.scheduledDays);
        expect(state.reps).toBe(step.reps);
        expect(state.lapses).toBe(step.lapses);
        expect(state.isLeech).toBe(step.isLeech);
        expect(state.dueMs).toBe(step.dueMs);
      }
    });
  }

  it('fold reproduit l\'état de référence (mode examen exclu)', () => {
    const events: ReviewEvent[] = golden.fold.events.map((e) => ({
      id: e.id,
      cardId: 'card-1',
      userId: 'user-1',
      deviceId: 'device-A',
      rating: e.rating as Rating,
      durationMs: 0,
      cardType: e.cardType as CardType,
      examMode: e.examMode,
      reviewedAtMs: e.reviewedAt,
    }));
    const state = engine.fold(events);
    expect(state.state).toBe(golden.fold.expected.state);
    expect(state.stability).toBeCloseTo(golden.fold.expected.stability, 1e-6);
    expect(state.difficulty).toBeCloseTo(golden.fold.expected.difficulty, 1e-6);
    expect(state.scheduledDays).toBe(golden.fold.expected.scheduledDays);
    expect(state.reps).toBe(golden.fold.expected.reps);
    expect(state.lapses).toBe(golden.fold.expected.lapses);
  });

  it.each(golden.previews)(
    'aperçu des boutons — état $name',
    (p) => {
      let state = {
        state: CardState.New,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        lastReviewMs: null,
        dueMs: null,
        isLeech: false,
      };
      let now = golden.t0;
      for (let i = 0; i < p.buildSteps.length; i++) {
        const s = p.buildSteps[i]!;
        if (i > 0) now += s.gapDays * 86_400_000;
        state = engine.applyReview(state, s.rating as Rating, now);
      }
      const preview = engine.preview(state, p.probeMs);
      expect(preview.again.scheduledDays).toBe(p.intervals.again);
      expect(preview.hard.scheduledDays).toBe(p.intervals.hard);
      expect(preview.good.scheduledDays).toBe(p.intervals.good);
      expect(preview.easy.scheduledDays).toBe(p.intervals.easy);
    },
  );
});

describe('Propriétés du fold (équivalentes au test Dart)', () => {
  const seedFn = (seed: number) => {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  };

  function makeLog(seed: number, count: number, deviceId = 'device-A'): ReviewEvent[] {
    const rng = seedFn(seed);
    let now = 1_700_000_000_000;
    const events: ReviewEvent[] = [];
    for (let i = 0; i < count; i++) {
      now += Math.floor(rng() * 5 * 86_400_000) + 60_000;
      events.push({
        id: `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
        cardId: 'card-1',
        userId: 'user-1',
        deviceId,
        rating: Math.floor(rng() * 4) + 1 as Rating,
        durationMs: Math.floor(rng() * 30_000),
        cardType: (['basic', 'cloze', 'qcm'] as const)[Math.floor(rng() * 3)]! as CardType,
        examMode: false,
        reviewedAtMs: now,
      });
    }
    return events;
  }

  it('déterminisme : mêmes events ⇒ même état', () => {
    for (let seed = 0; seed < 50; seed++) {
      const log = makeLog(seed, 20);
      const a = engine.fold(log);
      const b = engine.fold(log);
      expect(a).toEqual(b);
    }
  });

  it('ordre d\'insertion sans influence', () => {
    for (let seed = 0; seed < 50; seed++) {
      const log = makeLog(seed, 20);
      const ref = engine.fold(log);
      const reversed = [...log].reverse();
      expect(engine.fold(reversed)).toEqual(ref);
    }
  });

  it('idempotence face aux doublons', () => {
    for (let seed = 0; seed < 30; seed++) {
      const log = makeLog(seed, 15);
      const once = engine.fold(log);
      const twice = engine.fold([...log, ...log]);
      expect(twice).toEqual(once);
    }
  });

  it('mode examen neutre', () => {
    for (let seed = 0; seed < 30; seed++) {
      const real = makeLog(seed, 12);
      const exams = makeLog(seed + 5000, 8, 'device-exam').map((e) => ({ ...e, examMode: true }));
      expect(engine.fold([...real, ...exams])).toEqual(engine.fold(real));
    }
  });
});
