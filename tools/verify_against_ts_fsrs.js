/**
 * Vérification croisée : notre implémentation de référence (Python, miroir du
 * Dart) contre `ts-fsrs`, la bibliothèque officielle FSRS utilisée par le
 * backend (architecture v2, §12).
 *
 * On compare les primitives du modèle (stabilité et difficulté initiales,
 * retrievability, stabilité après rappel / oubli / court terme) sur un large
 * balayage de paramètres. Un écart signale une erreur de formule.
 *
 * Usage : node tools/verify_against_ts_fsrs.js  (depuis /tmp/tsf où ts-fsrs
 * est installé, ou avec NODE_PATH pointant dessus)
 */

const { FSRSAlgorithm, generatorParameters } = require("ts-fsrs");

const params = generatorParameters({ enable_short_term: true });
const algo = new FSRSAlgorithm(params);
const w = params.w;

const out = {
  weights: Array.from(w),
  initStability: {},
  initDifficulty: {},
  retrievability: [],
  nextRecallStability: [],
  nextForgetStability: [],
  nextShortTermStability: [],
  nextDifficulty: [],
};

for (let g = 1; g <= 4; g++) {
  out.initStability[g] = algo.init_stability(g);
  out.initDifficulty[g] = algo.init_difficulty(g);
  out.nextDifficulty[g] = {};
  for (const d of [1, 2.5, 5, 5.28243442, 7.5, 10]) {
    out.nextDifficulty[g][d] = algo.next_difficulty(d, g);
  }
}

for (const S of [0.5, 1, 3.173, 10, 50, 365]) {
  for (const t of [0, 1, 5, 20, 100]) {
    out.retrievability.push({
      t,
      S,
      value: algo.forgetting_curve(t, S),
    });
  }
}

for (const d of [1, 3, 5.28243442, 7, 10]) {
  for (const s of [0.5, 1, 3.173, 10, 50]) {
    for (const r of [0.5, 0.7, 0.9, 0.95, 1.0]) {
      for (const g of [2, 3, 4]) {
        out.nextRecallStability.push({
          d, s, r, g,
          value: algo.next_recall_stability(d, s, r, g),
        });
      }
      out.nextForgetStability.push({
        d, s, r,
        value: algo.next_forget_stability(d, s, r),
      });
    }
  }
}

for (const s of [0.5, 1, 3.173, 10, 50]) {
  for (const g of [1, 2, 3, 4]) {
    out.nextShortTermStability.push({
      s, g,
      value: algo.next_short_term_stability(s, g),
    });
  }
}

process.stdout.write(JSON.stringify(out));
