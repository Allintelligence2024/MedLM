/// Moteur FSRS-5 — cœur scientifique de MedAnki DZ.
///
/// Toutes les fonctions de ce fichier sont **pures** : elles ne lisent aucune
/// horloge, aucun stockage, aucun réseau. L'instant courant est toujours passé
/// en paramètre (`nowMs`). C'est ce qui rend le moteur testable de façon
/// déterministe et rejouable — exigence non négociable de l'architecture v2 :
///
///     srs_state = FSRS.fold(events.where(!examMode).sortBy(reviewedAt))
///
/// Les formules sont alignées sur `ts-fsrs` (backend, Phase 6) afin que les
/// deux implémentations produisent des états identiques.
library;

import 'dart:math' as math;

import 'fsrs_parameters.dart';
import 'review_event.dart';
import 'srs_models.dart';

class FsrsEngine {
  const FsrsEngine({this.parameters = const FsrsParameters()});

  final FsrsParameters parameters;

  // --------------------------------------------------------------------------
  // Primitives du modèle
  // --------------------------------------------------------------------------

  /// Probabilité de rappel après [elapsedDays] jours : R(t,S) = (1 + F·t/S)^D.
  ///
  /// Vaut 1 à t = 0 et 0.9 lorsque t = S (par construction de [kFactor]).
  double retrievability(double elapsedDays, double stability) {
    if (stability <= 0) return 0.0;
    final double t = math.max(0.0, elapsedDays);
    return math.pow(1.0 + kFactor * t / stability, kDecay).toDouble();
  }

  /// Intervalle en jours pour atteindre la rétention cible depuis [stability].
  double intervalFromStability(double stability) {
    final double r = parameters.requestRetention;
    return (stability / kFactor) * (math.pow(r, 1.0 / kDecay) - 1.0);
  }

  /// Stabilité initiale, fonction de la première note.
  double _initialStability(Rating rating) {
    return _clamp(
        parameters.w(rating.value - 1), kMinStability, kMaxStability);
  }

  /// Difficulté initiale : D0(G) = w4 - e^(w5·(G-1)) + 1.
  double _initialDifficulty(Rating rating) {
    final double d =
        parameters.w(4) - math.exp(parameters.w(5) * (rating.value - 1)) + 1.0;
    return _clamp(d, kMinDifficulty, kMaxDifficulty);
  }

  /// Amortissement linéaire : les cartes déjà difficiles bougent moins.
  double _linearDamping(double deltaD, double difficulty) {
    return deltaD * (10.0 - difficulty) / 9.0;
  }

  /// Retour à la moyenne vers la difficulté d'une carte notée "Easy".
  double _meanReversion(double init, double current) {
    return parameters.w(7) * init + (1.0 - parameters.w(7)) * current;
  }

  /// Difficulté après une revue notée [rating].
  double _nextDifficulty(double difficulty, Rating rating) {
    final double deltaD = -parameters.w(6) * (rating.value - 3);
    final double damped = difficulty + _linearDamping(deltaD, difficulty);
    final double reverted =
        _meanReversion(_initialDifficulty(Rating.easy), damped);
    return _clamp(reverted, kMinDifficulty, kMaxDifficulty);
  }

  /// Stabilité après un rappel réussi (Hard / Good / Easy).
  ///
  /// Le gain est d'autant plus fort que la carte était sur le point d'être
  /// oubliée (terme `e^((1-R)·w10)`) : réviser trop tôt n'apporte presque rien.
  double _nextRecallStability(
      double d, double s, double r, Rating rating) {
    final double hardPenalty =
        rating == Rating.hard ? parameters.w(15) : 1.0;
    final double easyBonus = rating == Rating.easy ? parameters.w(16) : 1.0;
    final double next = s *
        (1.0 +
            math.exp(parameters.w(8)) *
                (11.0 - d) *
                math.pow(s, -parameters.w(9)) *
                (math.exp((1.0 - r) * parameters.w(10)) - 1.0) *
                hardPenalty *
                easyBonus);
    return _clamp(next, kMinStability, kMaxStability);
  }

  /// Stabilité après un oubli (note "Again") — primitive brute.
  ///
  /// Le découpage suit exactement celui de `ts-fsrs` : la borne court terme est
  /// appliquée par l'appelant ([_forgetStabilityClamped]), pas ici. Cela permet
  /// de comparer les primitives une à une entre Dart et TypeScript
  /// (cf. `tools/cross_check.py`, 601 valeurs vérifiées).
  double _nextForgetStability(double d, double s, double r) {
    final double sAfterFail = parameters.w(11) *
        math.pow(d, -parameters.w(12)) *
        (math.pow(s + 1.0, parameters.w(13)) - 1.0) *
        math.exp((1.0 - r) * parameters.w(14));
    return _clamp(sAfterFail, kMinStability, kMaxStability);
  }

  /// Stabilité post-oubli telle qu'utilisée par le planificateur.
  ///
  /// On ne laisse jamais un oubli produire une stabilité supérieure à ce que la
  /// décroissance court terme autorise : oublier une carte ne doit pas pouvoir
  /// allonger son intervalle.
  double _forgetStabilityClamped(double d, double s, double r) {
    final double sShort =
        s / math.exp(parameters.w(17) * parameters.w(18));
    final double upper = _nextForgetStability(d, s, r);
    return _clamp(sShort, kMinStability, upper);
  }

  /// Stabilité pour une revue effectuée le jour même (apprentissage).
  double _nextShortTermStability(double s, Rating rating) {
    final double next = s *
        math.exp(parameters.w(17) * (rating.value - 3 + parameters.w(18)));
    return _clamp(next, kMinStability, kMaxStability);
  }

  // --------------------------------------------------------------------------
  // Planification
  // --------------------------------------------------------------------------

  /// Applique une revue et retourne le nouvel état. Fonction pure.
  ///
  /// [nowMs] est l'instant de la revue ; [cardType] permet de tempérer le gain
  /// de stabilité des QCM (reconnaissance plutôt que rappel actif).
  SrsCardState applyReview(
    SrsCardState current,
    Rating rating,
    int nowMs, {
    CardType cardType = CardType.basic,
  }) {
    final int elapsedDays = current.lastReviewMs == null
        ? 0
        : math.max(0, (nowMs - current.lastReviewMs!) ~/ kMillisPerDay);

    SrsCardState next = current.copyWith(
      elapsedDays: elapsedDays,
      reps: current.reps + 1,
      lastReviewMs: nowMs,
    );

    // --- Première exposition ------------------------------------------------
    if (current.state == CardState.newCard) {
      next = next.copyWith(
        difficulty: _initialDifficulty(rating),
        stability: _initialStability(rating),
      );
      switch (rating) {
        case Rating.again:
          return next.copyWith(
            state: CardState.learning,
            scheduledDays: 0,
            dueMs: nowMs + _minutesToMs(kLearningStepsMinutes[0]),
          );
        case Rating.hard:
          return next.copyWith(
            state: CardState.learning,
            scheduledDays: 0,
            dueMs: nowMs + _minutesToMs(6.0),
          );
        case Rating.good:
          return next.copyWith(
            state: CardState.learning,
            scheduledDays: 0,
            dueMs: nowMs + _minutesToMs(kLearningStepsMinutes[1]),
          );
        case Rating.easy:
          // "Easy" dès la première vue : la carte est déjà connue, on la sort
          // immédiatement de l'apprentissage.
          final int ivl = _clampedInterval(next.stability);
          return next.copyWith(
            state: CardState.review,
            scheduledDays: ivl,
            dueMs: nowMs + ivl * kMillisPerDay,
          );
      }
    }

    final double r = retrievability(elapsedDays.toDouble(), current.stability);
    next = next.copyWith(difficulty: _nextDifficulty(current.difficulty, rating));

    // --- Apprentissage / ré-apprentissage -----------------------------------
    if (current.state == CardState.learning ||
        current.state == CardState.relearning) {
      next = next.copyWith(
        stability: _nextShortTermStability(current.stability, rating),
      );
      switch (rating) {
        case Rating.again:
          return next.copyWith(
            state: current.state,
            scheduledDays: 0,
            dueMs: nowMs + _minutesToMs(kLearningStepsMinutes[0]),
          );
        case Rating.hard:
          return next.copyWith(
            state: current.state,
            scheduledDays: 0,
            dueMs: nowMs + _minutesToMs(10.0),
          );
        case Rating.good:
        case Rating.easy:
          final int ivl = _clampedInterval(next.stability);
          return next.copyWith(
            state: CardState.review,
            scheduledDays: ivl,
            dueMs: nowMs + ivl * kMillisPerDay,
          );
      }
    }

    // --- Révision -----------------------------------------------------------
    //
    // Deux subtilités, toutes deux vérifiées contre `ts-fsrs`
    // (cf. tools/cross_check_sequences.py) :
    //
    // 1. La stabilité se calcule avec la difficulté **d'avant** la revue
    //    (`current.difficulty`), pas avec celle qu'on vient de recalculer.
    //    Utiliser la nouvelle biaiserait systématiquement les intervalles.
    //
    // 2. Une revue le jour même n'est pas un cas particulier : `elapsedDays`
    //    valant 0, R vaut 1 et la formule de rappel ne produit aucun gain.
    //    C'est le comportement voulu — réviser deux fois dans la même journée
    //    n'apprend rien de plus.
    double newStability = rating == Rating.again
        ? _forgetStabilityClamped(current.difficulty, current.stability, r)
        : _nextRecallStability(
            current.difficulty, current.stability, r, rating);

    // Pondération QCM : on conserve l'événement intact mais on réduit le gain.
    if (parameters.enableQcmWeighting &&
        cardType == CardType.qcm &&
        rating != Rating.again &&
        newStability > current.stability) {
      final double gain = newStability - current.stability;
      newStability = _clamp(current.stability + gain * kQcmStabilityWeight,
          kMinStability, kMaxStability);
    }

    next = next.copyWith(stability: newStability);

    if (rating == Rating.again) {
      final int lapses = current.lapses + 1;
      return next.copyWith(
        state: CardState.relearning,
        lapses: lapses,
        scheduledDays: 0,
        dueMs: nowMs + _minutesToMs(kRelearningStepsMinutes[0]),
        isLeech: lapses >= kLeechThreshold,
      );
    }

    final int ivl = _clampedInterval(newStability);
    return next.copyWith(
      state: CardState.review,
      scheduledDays: ivl,
      dueMs: nowMs + ivl * kMillisPerDay,
    );
  }

  /// Les quatre issues possibles, pour afficher l'intervalle sous chaque bouton
  /// **avant** que l'étudiant ne choisisse.
  SchedulingPreview preview(
    SrsCardState current,
    int nowMs, {
    CardType cardType = CardType.basic,
  }) {
    return SchedulingPreview(
      again: applyReview(current, Rating.again, nowMs, cardType: cardType),
      hard: applyReview(current, Rating.hard, nowMs, cardType: cardType),
      good: applyReview(current, Rating.good, nowMs, cardType: cardType),
      easy: applyReview(current, Rating.easy, nowMs, cardType: cardType),
    );
  }

  // --------------------------------------------------------------------------
  // Fold — la règle d'or
  // --------------------------------------------------------------------------

  /// Reconstruit l'état SRS à partir du journal d'événements.
  ///
  /// Propriétés garanties (couvertes par les tests) :
  ///   * **déterminisme** : mêmes événements ⇒ même état, bit à bit ;
  ///   * **indépendance à l'ordre d'insertion** : le tri se fait sur
  ///     `(reviewedAt, id)`, donc deux appareils qui synchronisent dans un
  ///     ordre différent convergent vers le même état ;
  ///   * **idempotence** : les doublons d'identifiant sont éliminés, ce qui
  ///     rend un `push` rejoué inoffensif ;
  ///   * **exclusion du mode examen** : un examen blanc ne décale rien.
  ///
  /// C'est cette fonction qui permet de fusionner deux journaux hors ligne sans
  /// jamais perdre ni inventer de progression.
  SrsCardState fold(Iterable<ReviewEvent> events) {
    final Map<String, ReviewEvent> unique = <String, ReviewEvent>{};
    for (final ReviewEvent e in events) {
      if (e.examMode) continue;
      unique[e.id] = e;
    }

    final List<ReviewEvent> ordered = unique.values.toList()
      ..sort((ReviewEvent a, ReviewEvent b) {
        final int byTime = a.reviewedAtMs.compareTo(b.reviewedAtMs);
        // Départage stable par identifiant : deux revues au même millième de
        // seconde sur deux appareils doivent s'ordonner identiquement partout.
        return byTime != 0 ? byTime : a.id.compareTo(b.id);
      });

    SrsCardState state = SrsCardState.initial;
    for (final ReviewEvent e in ordered) {
      state = applyReview(state, e.rating, e.reviewedAtMs, cardType: e.cardType);
    }
    return state;
  }

  /// Fusionne deux journaux (local et distant) puis rejoue le résultat.
  ///
  /// Utilisé par le moteur de synchronisation (Phase 8) : aucun événement n'est
  /// arbitré ni écrasé, l'union est simplement rejouée.
  SrsCardState mergeAndFold(
    Iterable<ReviewEvent> local,
    Iterable<ReviewEvent> remote,
  ) {
    return fold(<ReviewEvent>[...local, ...remote]);
  }

  // --------------------------------------------------------------------------
  // Utilitaires
  // --------------------------------------------------------------------------

  int _clampedInterval(double stability) {
    final double ivl = intervalFromStability(stability);
    final double rounded = ivl.roundToDouble();
    return _clamp(rounded, 1.0, parameters.maximumInterval.toDouble()).toInt();
  }

  static int _minutesToMs(double minutes) => (minutes * 60000).toInt();

  static double _clamp(double v, double lo, double hi) =>
      v < lo ? lo : (v > hi ? hi : v);
}
