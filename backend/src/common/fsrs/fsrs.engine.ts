/// FSRS-5 — moteur pur côté serveur.
///
/// Toutes les fonctions sont **pures** : aucun side-effect, aucune lecture
/// d'horloge ou de réseau. `nowMs` est toujours passé en paramètre. C'est
/// la condition de l'équivalence stricte avec le moteur Dart
/// (`mobile/lib/core/srs/fsrs_engine.dart`), vérifiée par les tests.
///
/// Découpage identique à la version Dart :
///   1. primitives (R, intervalle, stabilités, difficulté) ;
///   2. planificateur (applyReview) ;
///   3. fold (règle d'or de la v2 §4, propriété vérifiée par tests).
import {
  CardState,
  CardType,
  FsrsParameters,
  Rating,
  ReviewEvent,
  SchedulingPreview,
  SrsCardState,
  FSRS_DECAY,
  FSRS_FACTOR,
  FSRS_LEARNING_STEPS_MIN,
  FSRS_MAX_DIFFICULTY,
  FSRS_MAX_STABILITY,
  FSRS_MIN_DIFFICULTY,
  FSRS_MIN_STABILITY,
  FSRS_MILLIS_PER_DAY,
  FSRS_QCM_STABILITY_WEIGHT,
  FSRS_RELEARNING_STEPS_MIN,
  DEFAULT_PARAMETERS,
  SRS_INITIAL,
} from './fsrs.constants';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function minutesToMs(min: number): number {
  return Math.round(min * 60_000);
}

export class FsrsEngine {
  constructor(private readonly p: FsrsParameters = DEFAULT_PARAMETERS) {}

  // ── Primitives (miroir exact du Dart) ──────────────────────────────────

  retrievability(elapsedDays: number, stability: number): number {
    if (stability <= 0) return 0;
    const t = Math.max(0, elapsedDays);
    return Math.pow(1 + FSRS_FACTOR * (t / stability), FSRS_DECAY);
  }

  intervalFromStability(stability: number): number {
    const r = this.p.requestRetention;
    return (stability / FSRS_FACTOR) * (Math.pow(r, 1 / FSRS_DECAY) - 1);
  }

  private w(i: number): number {
    return this.p.weights[i]!;
  }

  private initialStability(r: Rating): number {
    return clamp(this.w(r - 1), FSRS_MIN_STABILITY, FSRS_MAX_STABILITY);
  }

  private initialDifficulty(r: Rating): number {
    const d = this.w(4) - Math.exp(this.w(5) * (r - 1)) + 1;
    return clamp(d, FSRS_MIN_DIFFICULTY, FSRS_MAX_DIFFICULTY);
  }

  private linearDamping(deltaD: number, difficulty: number): number {
    return (deltaD * (10 - difficulty)) / 9;
  }

  private meanReversion(init: number, current: number): number {
    return this.w(7) * init + (1 - this.w(7)) * current;
  }

  private nextDifficulty(difficulty: number, r: Rating): number {
    const deltaD = -this.w(6) * (r - 3);
    const damped = difficulty + this.linearDamping(deltaD, difficulty);
    const reverted = this.meanReversion(this.initialDifficulty(Rating.Easy), damped);
    return clamp(reverted, FSRS_MIN_DIFFICULTY, FSRS_MAX_DIFFICULTY);
  }

  private nextRecallStability(d: number, s: number, r: number, rating: Rating): number {
    const hardPenalty = rating === Rating.Hard ? this.w(15) : 1;
    const easyBonus = rating === Rating.Easy ? this.w(16) : 1;
    const next = s *
      (1 +
        Math.exp(this.w(8)) *
          (11 - d) *
          Math.pow(s, -this.w(9)) *
          (Math.exp((1 - r) * this.w(10)) - 1) *
          hardPenalty *
          easyBonus);
    return clamp(next, FSRS_MIN_STABILITY, FSRS_MAX_STABILITY);
  }

  private nextForgetStability(d: number, s: number, r: number): number {
    const sAfterFail =
      this.w(11) *
      Math.pow(d, -this.w(12)) *
      (Math.pow(s + 1, this.w(13)) - 1) *
      Math.exp((1 - r) * this.w(14));
    return clamp(sAfterFail, FSRS_MIN_STABILITY, FSRS_MAX_STABILITY);
  }

  private forgetStabilityClamped(d: number, s: number, r: number): number {
    const sShort = s / Math.exp(this.w(17) * this.w(18));
    const upper = this.nextForgetStability(d, s, r);
    return clamp(sShort, FSRS_MIN_STABILITY, upper);
  }

  private nextShortTermStability(s: number, rating: Rating): number {
    const next = s * Math.exp(this.w(17) * (rating - 3 + this.w(18)));
    return clamp(next, FSRS_MIN_STABILITY, FSRS_MAX_STABILITY);
  }

  private clampedInterval(stability: number): number {
    const ivl = this.intervalFromStability(stability);
    const rounded = Math.round(ivl);
    return Math.round(clamp(rounded, 1, this.p.maximumInterval));
  }

  // ── Planificateur ──────────────────────────────────────────────────────

  applyReview(
    current: SrsCardState,
    rating: Rating,
    nowMs: number,
    cardType: CardType = CardType.Basic,
  ): SrsCardState {
    const elapsedDays =
      current.lastReviewMs === null
        ? 0
        : Math.max(0, Math.floor((nowMs - current.lastReviewMs) / FSRS_MILLIS_PER_DAY));

    let next: SrsCardState = {
      ...current,
      elapsedDays,
      reps: current.reps + 1,
      lastReviewMs: nowMs,
    };

    // Première exposition
    if (current.state === CardState.New) {
      next = {
        ...next,
        difficulty: this.initialDifficulty(rating),
        stability: this.initialStability(rating),
      };
      switch (rating) {
        case Rating.Again:
          return {
            ...next,
            state: CardState.Learning,
            scheduledDays: 0,
            dueMs: nowMs + minutesToMs(FSRS_LEARNING_STEPS_MIN[0]!),
          };
        case Rating.Hard:
          return {
            ...next,
            state: CardState.Learning,
            scheduledDays: 0,
            dueMs: nowMs + minutesToMs(6),
          };
        case Rating.Good:
          return {
            ...next,
            state: CardState.Learning,
            scheduledDays: 0,
            dueMs: nowMs + minutesToMs(FSRS_LEARNING_STEPS_MIN[1]!),
          };
        case Rating.Easy: {
          const ivl = this.clampedInterval(next.stability);
          return {
            ...next,
            state: CardState.Review,
            scheduledDays: ivl,
            dueMs: nowMs + ivl * FSRS_MILLIS_PER_DAY,
          };
        }
      }
    }

    const r = this.retrievability(elapsedDays, current.stability);
    next = { ...next, difficulty: this.nextDifficulty(current.difficulty, rating) };

    // Apprentissage / ré-apprentissage
    if (current.state === CardState.Learning || current.state === CardState.Relearning) {
      next = {
        ...next,
        stability: this.nextShortTermStability(current.stability, rating),
      };
      switch (rating) {
        case Rating.Again:
          return {
            ...next,
            state: current.state,
            scheduledDays: 0,
            dueMs: nowMs + minutesToMs(FSRS_LEARNING_STEPS_MIN[0]!),
          };
        case Rating.Hard:
          return {
            ...next,
            state: current.state,
            scheduledDays: 0,
            dueMs: nowMs + minutesToMs(10),
          };
        case Rating.Good:
        case Rating.Easy: {
          const ivl = this.clampedInterval(next.stability);
          return {
            ...next,
            state: CardState.Review,
            scheduledDays: ivl,
            dueMs: nowMs + ivl * FSRS_MILLIS_PER_DAY,
          };
        }
      }
    }

    // Révision (rappel ou oubli)
    let newStability =
      rating === Rating.Again
        ? this.forgetStabilityClamped(current.difficulty, current.stability, r)
        : this.nextRecallStability(current.difficulty, current.stability, r, rating);

    if (
      this.p.enableQcmWeighting &&
      cardType === CardType.Qcm &&
      rating !== Rating.Again &&
      newStability > current.stability
    ) {
      const gain = newStability - current.stability;
      newStability = clamp(
        current.stability + gain * FSRS_QCM_STABILITY_WEIGHT,
        FSRS_MIN_STABILITY,
        FSRS_MAX_STABILITY,
      );
    }

    next = { ...next, stability: newStability };

    if (rating === Rating.Again) {
      const lapses = current.lapses + 1;
      return {
        ...next,
        state: CardState.Relearning,
        lapses,
        scheduledDays: 0,
        dueMs: nowMs + minutesToMs(FSRS_RELEARNING_STEPS_MIN[0]!),
        isLeech: lapses >= FSRS_LEECH_THRESHOLD,
      };
    }

    const ivl = this.clampedInterval(newStability);
    return {
      ...next,
      state: CardState.Review,
      scheduledDays: ivl,
      dueMs: nowMs + ivl * FSRS_MILLIS_PER_DAY,
    };
  }

  preview(current: SrsCardState, nowMs: number, cardType: CardType = CardType.Basic): SchedulingPreview {
    return {
      again: this.applyReview(current, Rating.Again, nowMs, cardType),
      hard: this.applyReview(current, Rating.Hard, nowMs, cardType),
      good: this.applyReview(current, Rating.Good, nowMs, cardType),
      easy: this.applyReview(current, Rating.Easy, nowMs, cardType),
    };
  }

  // ── Fold (la règle d'or) ───────────────────────────────────────────────

  /**
   * Reconstruit l'état SRS à partir d'un journal d'événements.
   *
   * Propriétés garanties (testées) :
   *   * déterminisme : mêmes events ⇒ même état ;
   *   * commutativité : peu importe l'ordre d'insertion ;
   *   * idempotence : doublons d'id ⇒ même état ;
   *   * exclusion du mode examen : un examen blanc ne décale pas.
   */
  fold(events: Iterable<ReviewEvent>): SrsCardState {
    const unique = new Map<string, ReviewEvent>();
    for (const e of events) {
      if (e.examMode) continue;
      unique.set(e.id, e);
    }
    const ordered = Array.from(unique.values()).sort((a, b) => {
      const byTime = a.reviewedAtMs - b.reviewedAtMs;
      return byTime !== 0 ? byTime : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    let state: SrsCardState = SRS_INITIAL;
    for (const e of ordered) {
      state = this.applyReview(state, e.rating, e.reviewedAtMs, e.cardType);
    }
    return state;
  }

  mergeAndFold(local: Iterable<ReviewEvent>, remote: Iterable<ReviewEvent>): SrsCardState {
    return this.fold([...local, ...remote]);
  }
}
