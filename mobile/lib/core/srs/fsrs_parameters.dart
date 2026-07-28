/// Paramètres et constantes du modèle FSRS-5.
///
/// FSRS-5 ("Free Spaced Repetition Scheduler", 2024) modélise la mémoire par
/// deux variables latentes par carte :
///   * `stability`  — nombre de jours au bout desquels la probabilité de
///                    rappel retombe à 90 % ;
///   * `difficulty` — difficulté intrinsèque de la carte, dans [1, 10].
///
/// À la différence de SM-2 (facteur de facilité fixe), FSRS modélise
/// explicitement la courbe d'oubli, ce qui permet de viser une rétention
/// cible (`requestRetention`) plutôt que de subir des intervalles arbitraires.
library;

import 'dart:math' as math;

/// Poids par défaut de FSRS-5 (19 paramètres, optimisables par utilisateur).
///
/// Ils proviennent de l'optimisation sur le jeu de données public
/// open-spaced-repetition et sont identiques à ceux de `ts-fsrs`, afin que le
/// moteur Dart (mobile) et le moteur TypeScript (backend, Phase 6) produisent
/// exactement le même état pour la même suite d'événements.
const List<double> kDefaultFsrsWeights = <double>[
  0.40255, // w0  : stabilité initiale après "Again"
  1.18385, // w1  : stabilité initiale après "Hard"
  3.17300, // w2  : stabilité initiale après "Good"
  15.69105, // w3  : stabilité initiale après "Easy"
  7.19490, // w4  : difficulté initiale (ordonnée)
  0.53450, // w5  : difficulté initiale (pente exponentielle)
  1.46040, // w6  : variation de difficulté par note
  0.00460, // w7  : force du retour à la moyenne (mean reversion)
  1.54575, // w8  : gain de stabilité en cas de rappel réussi
  0.11920, // w9  : amortissement du gain par la stabilité courante
  1.01925, // w10 : gain lié à la difficulté de récupération (1 - R)
  1.93950, // w11 : stabilité post-oubli (facteur)
  0.11000, // w12 : stabilité post-oubli (exposant difficulté)
  0.29605, // w13 : stabilité post-oubli (exposant stabilité)
  2.26980, // w14 : stabilité post-oubli (facteur 1 - R)
  0.23150, // w15 : pénalité "Hard"
  2.98980, // w16 : bonus "Easy"
  0.51655, // w17 : stabilité court terme (même journée)
  0.66210, // w18 : stabilité court terme (décalage de note)
];

/// Exposant de la courbe d'oubli FSRS-5.
const double kDecay = -0.5;

/// Facteur dérivé de [kDecay] tel que R = 0.9 lorsque t = S.
///
/// FACTOR = 0.9^(1/DECAY) - 1 = 19/81 ≈ 0.2345679
final double kFactor = math.pow(0.9, 1 / kDecay) - 1;

/// Bornes de sécurité sur la stabilité (en jours).
const double kMinStability = 0.01;
const double kMaxStability = 36500.0;

/// Bornes de la difficulté.
const double kMinDifficulty = 1.0;
const double kMaxDifficulty = 10.0;

/// Nombre de lapses à partir duquel une carte est marquée "leech".
const int kLeechThreshold = 8;

/// Pondération appliquée au gain de stabilité des cartes QCM.
///
/// Un QCM teste la *reconnaissance*, signal plus faible qu'un *rappel actif*.
/// On ne tronque pas l'information (l'événement est conservé tel quel dans le
/// journal), on tempère seulement l'effet sur la planification.
const double kQcmStabilityWeight = 0.85;

/// Paliers d'apprentissage, en minutes.
const List<double> kLearningStepsMinutes = <double>[1.0, 10.0];

/// Paliers de ré-apprentissage, en minutes.
const List<double> kRelearningStepsMinutes = <double>[10.0];

/// Millisecondes dans une journée.
const int kMillisPerDay = 86400000;

/// Configuration de planification, ajustable par l'utilisateur.
class FsrsParameters {
  const FsrsParameters({
    this.weights = kDefaultFsrsWeights,
    this.requestRetention = 0.9,
    this.maximumInterval = 36500,
    this.enableQcmWeighting = true,
  }) : assert(weights.length == 19, 'FSRS-5 requiert exactement 19 poids');

  /// Les 19 poids du modèle.
  final List<double> weights;

  /// Probabilité de rappel visée au moment de la revue (0.7 à 0.98).
  final double requestRetention;

  /// Intervalle maximal en jours.
  final int maximumInterval;

  /// Applique [kQcmStabilityWeight] aux cartes de type QCM.
  final bool enableQcmWeighting;

  double w(int i) => weights[i];

  FsrsParameters copyWith({
    List<double>? weights,
    double? requestRetention,
    int? maximumInterval,
    bool? enableQcmWeighting,
  }) {
    return FsrsParameters(
      weights: weights ?? this.weights,
      requestRetention: requestRetention ?? this.requestRetention,
      maximumInterval: maximumInterval ?? this.maximumInterval,
      enableQcmWeighting: enableQcmWeighting ?? this.enableQcmWeighting,
    );
  }
}
