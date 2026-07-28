/**
 * Équivalence de bout en bout avec `ts-fsrs`.
 *
 * On ne compare plus des primitives isolées mais des **séquences complètes de
 * révision** passées au planificateur officiel (`FSRS.repeat`), état après
 * état. C'est la garantie que le moteur Dart mobile et le moteur TypeScript du
 * backend (Phase 6) resteront synchronisés.
 *
 * Note : ts-fsrs gère les paliers d'apprentissage différemment de nous (nos
 * paliers 1min/6min/10min sont un choix produit). On compare donc ce qui doit
 * impérativement coïncider : stabilité, difficulté, lapses et reps.
 */

const { fsrs, generatorParameters, Rating, State, createEmptyCard } = require("ts-fsrs");

const params = generatorParameters({ enable_short_term: true });
const f = fsrs(params);

const DAY = 86400000;
const T0 = 1700000000000;

const RATING = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy };
const STATE_NAME = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

const sequences = {
  repeat_good: [[3, 0], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1]],
  learn_then_review: [[3, 0], [3, 0], [3, 4], [3, 14], [3, 40]],
  lapse_and_recover: [[3, 0], [3, 0], [3, 4], [1, 14], [3, 0], [3, 3]],
  hard_struggler: [[2, 0], [2, 0], [2, 2], [2, 3], [2, 4]],
  easy_fast_track: [[4, 0], [4, 20], [4, 90]],
  mixed_realistic: [[3, 0], [2, 0], [3, 2], [4, 6], [1, 30], [3, 0], [3, 2], [3, 7]],
  again_then_good: [[1, 0], [3, 0], [3, 1], [3, 5]],
  same_day: [[3, 0], [3, 0], [3, 0], [3, 0]],
  long_overdue: [[3, 0], [3, 0], [3, 4], [3, 200]],
  all_again: [[1, 0], [1, 1], [1, 1], [1, 1]],
  alternating: [[3, 0], [1, 2], [3, 0], [1, 3], [4, 5], [2, 8]],
};

const out = {};

for (const [name, steps] of Object.entries(sequences)) {
  let card = createEmptyCard(new Date(T0));
  let now = T0;
  const trace = [];
  steps.forEach(([grade, gap], i) => {
    if (i > 0) now += gap * DAY;
    const result = f.repeat(card, new Date(now));
    const picked = result[RATING[grade]];
    card = picked.card;
    trace.push({
      rating: grade,
      gapDays: gap,
      nowMs: now,
      state: STATE_NAME[card.state],
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      scheduled_days: card.scheduled_days,
      elapsed_days: card.elapsed_days,
    });
  });
  out[name] = trace;
}

process.stdout.write(JSON.stringify(out));
