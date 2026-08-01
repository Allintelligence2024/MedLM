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

/**
 * Phase 19.6 — primitives rejouées avec les poids ADAPTATIFS (miroir de
 * ADAPTIVE_THRESHOLDS côté backend : fragile → w[11] ×1.15, fort →
 * w[8] ×1.05). cross_check.py compare à notre référence Python avec les
 * mêmes ajustements : un écart signalerait que l'ajustement n'a pas le
 * même effet des deux côtés.
 */
function emitAdaptive(label, mutate) {
  const customW = Array.from(w);
  mutate(customW);
  const adaptiveAlgo = new FSRSAlgorithm(
    generatorParameters({ enable_short_term: true, w: customW }),
  );
  const section = {
    weights: customW,
    nextRecallStability: [],
    nextForgetStability: [],
  };
  for (const d of [3, 5.28243442, 7]) {
    for (const s of [1, 3.173, 10]) {
      for (const r of [0.7, 0.9, 1.0]) {
        for (const g of [2, 3, 4]) {
          section.nextRecallStability.push({
            d, s, r, g,
            value: adaptiveAlgo.next_recall_stability(d, s, r, g),
          });
        }
        section.nextForgetStability.push({
          d, s, r,
          value: adaptiveAlgo.next_forget_stability(d, s, r),
        });
      }
    }
  }
  out.adaptive[label] = section;
}

out.adaptive = {};
emitAdaptive("fragile_w11_x1_15", (customW) => {
  customW[11] = params.w[11] * 1.15;
});
emitAdaptive("strong_w8_x1_05", (customW) => {
  customW[8] = params.w[8] * 1.05;
});

process.stdout.write(JSON.stringify(out));
