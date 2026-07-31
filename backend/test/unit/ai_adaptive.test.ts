// Tests Phase 18.4 — Adaptive learning (logique pure, sans DB).
import { describe, it, expect } from 'vitest';
import {
  AdaptiveService,
  ADAPTIVE_THRESHOLDS,
  type ReviewRow,
  type SignalInput,
} from '../../src/ai/adaptive/adaptive.service';
import { FSRS_MILLIS_PER_DAY, FSRS_WEIGHTS } from '../../src/common/fsrs/fsrs.constants';
import { SignalsListQuery, SignalsScanBody } from '../../src/ai/adaptive/adaptive.dto';

const NOW = 1_800_000_000_000; // 2027-01-15T06:40:00Z

function mkReview(partial: Partial<ReviewRow>): ReviewRow {
  return {
    cardId: 'card-1',
    rating: 3,
    reviewedAt: NOW - 1 * FSRS_MILLIS_PER_DAY,
    tags: ['anat'],
    ...partial,
  };
}

// ── analyzeErrorPatterns ────────────────────────────────────────────
describe('AdaptiveService.analyzeErrorPatterns', () => {
  it('ignore les revues hors fenêtre', () => {
    const rows = [
      mkReview({ rating: 1, reviewedAt: NOW - 40 * FSRS_MILLIS_PER_DAY }), // hors 30j
      mkReview({ rating: 1 }),
      mkReview({ rating: 1 }),
      mkReview({ rating: 4 }),
    ];
    const p = AdaptiveService.analyzeErrorPatterns(rows, { now: NOW });
    expect(p.totalReviews).toBe(3);
    expect(p.lapses).toBe(2);
    expect(p.lapseRate).toBeCloseTo(2 / 3, 5);
  });

  it('lapseRate = 0 quand aucune revue', () => {
    const p = AdaptiveService.analyzeErrorPatterns([], { now: NOW });
    expect(p.lapseRate).toBe(0);
    expect(p.leechCards).toEqual([]);
    expect(p.hotTags).toEqual([]);
  });

  it('leech candidate : ≥3 lapses ET ≥50% d\'échecs sur la carte', () => {
    const rows = [
      // card-1 : 4 revues, 3 lapses (75 %) → leech
      mkReview({ cardId: 'card-1', rating: 1 }),
      mkReview({ cardId: 'card-1', rating: 1 }),
      mkReview({ cardId: 'card-1', rating: 1 }),
      mkReview({ cardId: 'card-1', rating: 4 }),
      // card-2 : 3 revues, 2 lapses → pas assez
      mkReview({ cardId: 'card-2', rating: 1 }),
      mkReview({ cardId: 'card-2', rating: 1 }),
      mkReview({ cardId: 'card-2', rating: 3 }),
    ];
    const p = AdaptiveService.analyzeErrorPatterns(rows, { now: NOW });
    expect(p.leechCards.map((c) => c.cardId)).toEqual(['card-1']);
    expect(p.leechCards[0]!.lapses).toBe(3);
  });

  it('hotTags : min 5 revues, triés par taux d\'échec décroissant', () => {
    const rows: ReviewRow[] = [];
    // tag 'nerf radial' : 5 revues, 4 échecs (80 %)
    for (let i = 0; i < 5; i++)
      rows.push(mkReview({ cardId: `a${i}`, rating: i < 4 ? 1 : 3, tags: ['Nerf Radial'] }));
    // tag 'muscle' : 5 revues, 2 échecs (40 %) → pile au seuil
    for (let i = 0; i < 5; i++)
      rows.push(mkReview({ cardId: `b${i}`, rating: i < 2 ? 1 : 3, tags: ['muscle'] }));
    // tag 'veine' : 2 revues → ignorer (pas assez de masse)
    rows.push(mkReview({ cardId: 'c1', rating: 1, tags: ['veine'] }));

    const p = AdaptiveService.analyzeErrorPatterns(rows, { now: NOW });
    expect(p.hotTags[0]!.tag).toBe('nerf radial');
    expect(p.hotTags[0]!.lapseRate).toBeCloseTo(0.8, 5);
    expect(p.hotTags.map((t) => t.tag)).toContain('muscle');
    expect(p.hotTags.map((t) => t.tag)).not.toContain('veine');
  });

  it('tags normalisés et dédupliqués par revue', () => {
    const rows = [mkReview({ rating: 1, tags: ['Anat', 'ANAT', 'anat'] })];
    const p = AdaptiveService.analyzeErrorPatterns(rows, { now: NOW });
    expect(p.lapses).toBe(1); // une seule revue → un seul lapse, pas 3
  });
});

// ── computeFsrsAdjustment ───────────────────────────────────────────
describe('AdaptiveService.computeFsrsAdjustment', () => {
  it('inactif avec < 100 revues (pas assez de recul)', () => {
    const r = AdaptiveService.computeFsrsAdjustment({ totalReviews: 99, lapseRate: 0.9 });
    expect(r.changedIndices).toEqual([]);
    expect(r.weights).toEqual([...FSRS_WEIGHTS]);
    expect(r.reasons).toEqual([]);
  });

  it('fragile (≥30% échecs) → w11 × 1.15, justifié', () => {
    const r = AdaptiveService.computeFsrsAdjustment({ totalReviews: 150, lapseRate: 0.32 });
    expect(r.changedIndices).toEqual([11]);
    expect(r.weights[11]).toBeCloseTo(FSRS_WEIGHTS[11]! * 1.15, 10);
    expect(r.reasons[0]).toContain('lapse_rate élevé');
    for (let i = 0; i < 19; i++) {
      if (i !== 11) expect(r.weights[i]).toBeCloseTo(FSRS_WEIGHTS[i]!, 10);
    }
  });

  it('fort (≤5% échecs, ≥200 revues) → w8 × 1.05', () => {
    const r = AdaptiveService.computeFsrsAdjustment({ totalReviews: 250, lapseRate: 0.03 });
    expect(r.changedIndices).toEqual([8]);
    expect(r.weights[8]).toBeCloseTo(FSRS_WEIGHTS[8]! * 1.05, 10);
    expect(r.reasons[0]).toContain('faible');
  });

  it('neutre : ni fragile ni fort → aucun changement', () => {
    const r = AdaptiveService.computeFsrsAdjustment({ totalReviews: 500, lapseRate: 0.15 });
    expect(r.changedIndices).toEqual([]);
    expect(r.weights).toEqual([...FSRS_WEIGHTS]);
  });

  it('clampWeights borne chaque poids dans [0.5×, 2×] de la base', () => {
    const wild = FSRS_WEIGHTS.map((w) => w * 100);
    const clamped = AdaptiveService.clampWeights(wild);
    for (let i = 0; i < 19; i++) {
      expect(clamped[i]).toBeCloseTo(FSRS_WEIGHTS[i]! * 2, 10);
    }
    const tiny = FSRS_WEIGHTS.map((w) => w * 0.01);
    const clampedLow = AdaptiveService.clampWeights(tiny);
    for (let i = 0; i < 19; i++) {
      expect(clampedLow[i]).toBeCloseTo(FSRS_WEIGHTS[i]! * 0.5, 10);
    }
  });

  it('toujours 19 poids en sortie', () => {
    const r = AdaptiveService.computeFsrsAdjustment({ totalReviews: 300, lapseRate: 0.5 });
    expect(r.weights.length).toBe(19);
  });
});

// ── buildDifficultySignals ──────────────────────────────────────────
describe('AdaptiveService.buildDifficultySignals', () => {
  const rows: SignalInput[] = [
    // card-1 : 5 utilisateurs × 3 lapses → signal
    ...Array.from({ length: 5 }, (_, i) => ({ cardId: 'card-1', userId: `u${i}`, lapses: 3 })),
    // card-2 : 4 utilisateurs → sous le seuil
    ...Array.from({ length: 4 }, (_, i) => ({ cardId: 'card-2', userId: `u${i}`, lapses: 5 })),
    // card-3 : 6 utilisateurs mais 2 lapses chacun → sous le seuil lapses
    ...Array.from({ length: 6 }, (_, i) => ({ cardId: 'card-3', userId: `u${i}`, lapses: 2 })),
  ];

  it('seuls les seuils franchis produisent un signal', () => {
    const signals = AdaptiveService.buildDifficultySignals(rows);
    expect(signals.length).toBe(1);
    expect(signals[0]!.cardId).toBe('card-1');
    expect(signals[0]!.affectedUsers).toBe(5);
    expect(signals[0]!.totalLapses).toBe(15);
  });

  it('un utilisateur compté une fois même avec plusieurs lignes', () => {
    const dup: SignalInput[] = [
      { cardId: 'card-9', userId: 'u1', lapses: 4 },
      { cardId: 'card-9', userId: 'u1', lapses: 3 },
      ...Array.from({ length: 4 }, (_, i) => ({ cardId: 'card-9', userId: `x${i}`, lapses: 4 })),
    ];
    const signals = AdaptiveService.buildDifficultySignals(dup);
    expect(signals[0]!.affectedUsers).toBe(5); // pas 6
  });

  it('seuils personnalisables', () => {
    const signals = AdaptiveService.buildDifficultySignals(rows, {
      minLapsesPerUser: 2,
      minAffectedUsers: 3,
    });
    expect(signals.length).toBe(3); // les 3 cartes passent
  });

  it('tri décroissant par utilisateurs affectés', () => {
    const many: SignalInput[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ cardId: 'c5', userId: `a${i}`, lapses: 3 })),
      ...Array.from({ length: 8 }, (_, i) => ({ cardId: 'c8', userId: `b${i}`, lapses: 3 })),
    ];
    const signals = AdaptiveService.buildDifficultySignals(many);
    expect(signals[0]!.cardId).toBe('c8');
  });
});

// ── Validation Zod ──────────────────────────────────────────────────
describe('Signals DTOs — validation Zod', () => {
  it('SignalsListQuery : defaults', () => {
    const r = SignalsListQuery.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('open');
      expect(r.data.limit).toBe(50);
    }
  });

  it('SignalsListQuery : coerce la query string "20" → 20', () => {
    const r = SignalsListQuery.safeParse({ limit: '20' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(20);
  });

  it('SignalsScanBody : defaults complets', () => {
    const r = SignalsScanBody.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.min_lapses_per_user).toBe(ADAPTIVE_THRESHOLDS.SIGNAL_MIN_LAPSES_PER_USER);
      expect(r.data.min_affected_users).toBe(ADAPTIVE_THRESHOLDS.SIGNAL_MIN_AFFECTED_USERS);
      expect(r.data.window_days).toBe(30);
    }
  });

  it('SignalsScanBody : borne haute rejetée', () => {
    expect(SignalsScanBody.safeParse({ window_days: 366 }).success).toBe(false);
    expect(SignalsScanBody.safeParse({ min_affected_users: 101 }).success).toBe(false);
  });
});
