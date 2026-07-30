/// FSRS-5 — constantes et types partagés.
///
/// Mêmes 19 poids que le moteur Dart (`mobile/lib/core/srs/fsrs_parameters.dart`).
/// L'alignement bit-à-bit est la condition de l'équivalence cross-platform
/// (Phase 6) : si on touche à un seul poids ici, on DOIT le toucher là-bas
/// et régénérer les golden tests.
export const FSRS_WEIGHTS: readonly number[] = Object.freeze([
  0.40255, // w0  : stabilité initiale après "Again"
  1.18385, // w1  : stabilité initiale après "Hard"
  3.173,   // w2  : stabilité initiale après "Good"
  15.69105, // w3  : stabilité initiale après "Easy"
  7.1949,  // w4  : difficulté initiale (ordonnée)
  0.5345,  // w5  : difficulté initiale (pente exponentielle)
  1.4604,  // w6  : variation de difficulté par note
  0.0046,  // w7  : force du retour à la moyenne
  1.54575, // w8  : gain de stabilité en cas de rappel réussi
  0.1192,  // w9  : amortissement du gain par la stabilité courante
  1.01925, // w10 : gain lié à la difficulté de récupération
  1.9395,  // w11 : stabilité post-oubli (facteur)
  0.11,    // w12 : stabilité post-oubli (exposant difficulté)
  0.29605, // w13 : stabilité post-oubli (exposant stabilité)
  2.2698,  // w14 : stabilité post-oubli (facteur 1 - R)
  0.2315,  // w15 : pénalité "Hard"
  2.9898,  // w16 : bonus "Easy"
  0.51655, // w17 : stabilité court terme
  0.6621,  // w18 : stabilité court terme (décalage de note)
]);

export const FSRS_DECAY = -0.5;
/// 0.9^(1/DECAY) - 1 = 19/81 ≈ 0.2345679
export const FSRS_FACTOR = Math.pow(0.9, 1 / FSRS_DECAY) - 1;

export const FSRS_MIN_STABILITY = 0.01;
export const FSRS_MAX_STABILITY = 36500;
export const FSRS_MIN_DIFFICULTY = 1;
export const FSRS_MAX_DIFFICULTY = 10;

export const FSRS_LEECH_THRESHOLD = 8;
export const FSRS_QCM_STABILITY_WEIGHT = 0.85;
export const FSRS_MILLIS_PER_DAY = 86_400_000;

export const FSRS_LEARNING_STEPS_MIN: readonly number[] = Object.freeze([1, 10]);
export const FSRS_RELEARNING_STEPS_MIN: readonly number[] = Object.freeze([10]);

export enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export enum CardState {
  New = 'new',
  Learning = 'learning',
  Review = 'review',
  Relearning = 'relearning',
}

export enum CardType {
  Basic = 'basic',
  Cloze = 'cloze',
  Qcm = 'qcm',
}

export interface SrsCardState {
  state: CardState;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewMs: number | null;
  dueMs: number | null;
  isLeech: boolean;
}

export const SRS_INITIAL: SrsCardState = Object.freeze({
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
}) as SrsCardState;

export interface ReviewEvent {
  id: string;
  cardId: string;
  userId: string;
  deviceId: string;
  rating: Rating;
  reviewedAtMs: number;
  durationMs: number;
  cardType: CardType;
  examMode: boolean;
}

export interface SchedulingPreview {
  again: SrsCardState;
  hard: SrsCardState;
  good: SrsCardState;
  easy: SrsCardState;
}

export interface FsrsParameters {
  weights: readonly number[];
  requestRetention: number;
  maximumInterval: number;
  enableQcmWeighting: boolean;
}

export const DEFAULT_PARAMETERS: FsrsParameters = Object.freeze({
  weights: FSRS_WEIGHTS,
  requestRetention: 0.9,
  maximumInterval: 36500,
  enableQcmWeighting: true,
});
