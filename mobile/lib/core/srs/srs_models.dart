/// Modèles de domaine du moteur SRS.
///
/// Ces types sont volontairement **purs** : aucune annotation de base de
/// données, aucune dépendance Flutter. La couche data (Phase 2, Drift) les
/// mappera vers/depuis SQLite.
library;

/// Note attribuée à une revue.
///
/// Les valeurs numériques (1..4) sont figées par le protocole de
/// synchronisation : elles sont persistées dans `review_log` et envoyées au
/// serveur. Ne jamais les renuméroter.
enum Rating {
  again(1),
  hard(2),
  good(3),
  easy(4);

  const Rating(this.value);

  /// Valeur persistée / transmise sur le réseau.
  final int value;

  static Rating fromValue(int value) {
    switch (value) {
      case 1:
        return Rating.again;
      case 2:
        return Rating.hard;
      case 3:
        return Rating.good;
      case 4:
        return Rating.easy;
      default:
        throw ArgumentError.value(value, 'value', 'Rating invalide (1..4)');
    }
  }
}

/// État d'une carte dans la machine à états FSRS.
enum CardState {
  newCard('new'),
  learning('learning'),
  review('review'),
  relearning('relearning');

  const CardState(this.wire);

  /// Représentation stable persistée en base et sur le réseau.
  final String wire;

  static CardState fromWire(String wire) {
    return CardState.values.firstWhere(
      (CardState s) => s.wire == wire,
      orElse: () => throw ArgumentError.value(wire, 'wire', 'CardState inconnu'),
    );
  }
}

/// Nature de la carte révisée.
enum CardType {
  basic('basic'),
  cloze('cloze'),
  qcm('qcm');

  const CardType(this.wire);

  final String wire;

  static CardType fromWire(String wire) {
    return CardType.values.firstWhere(
      (CardType t) => t.wire == wire,
      orElse: () => throw ArgumentError.value(wire, 'wire', 'CardType inconnu'),
    );
  }
}

/// État SRS courant d'une carte pour un utilisateur donné.
///
/// C'est une valeur **dérivée** : elle est toujours recalculable à partir du
/// journal d'événements via [FsrsEngine.fold]. Elle n'est stockée que pour
/// éviter de rejouer tout l'historique à chaque ouverture de l'application.
class SrsCardState {
  const SrsCardState({
    this.state = CardState.newCard,
    this.stability = 0.0,
    this.difficulty = 0.0,
    this.elapsedDays = 0,
    this.scheduledDays = 0,
    this.reps = 0,
    this.lapses = 0,
    this.lastReviewMs,
    this.dueMs,
    this.isLeech = false,
  });

  /// État initial d'une carte jamais vue.
  static const SrsCardState initial = SrsCardState();

  final CardState state;

  /// Résistance à l'oubli, en jours.
  final double stability;

  /// Difficulté intrinsèque, dans [1, 10].
  final double difficulty;

  /// Jours écoulés entre l'avant-dernière et la dernière revue.
  final int elapsedDays;

  /// Intervalle planifié en jours (0 pendant l'apprentissage intra-journalier).
  final int scheduledDays;

  final int reps;
  final int lapses;

  /// Horodatage de la dernière revue (epoch ms), `null` si jamais révisée.
  final int? lastReviewMs;

  /// Horodatage de la prochaine échéance (epoch ms).
  final int? dueMs;

  /// Vraie dès [kLeechThreshold] lapses : la carte est à reformuler.
  final bool isLeech;

  bool get isNew => state == CardState.newCard;

  /// La carte est-elle due à [nowMs] ?
  bool isDue(int nowMs) => dueMs == null || dueMs! <= nowMs;

  SrsCardState copyWith({
    CardState? state,
    double? stability,
    double? difficulty,
    int? elapsedDays,
    int? scheduledDays,
    int? reps,
    int? lapses,
    int? lastReviewMs,
    int? dueMs,
    bool? isLeech,
  }) {
    return SrsCardState(
      state: state ?? this.state,
      stability: stability ?? this.stability,
      difficulty: difficulty ?? this.difficulty,
      elapsedDays: elapsedDays ?? this.elapsedDays,
      scheduledDays: scheduledDays ?? this.scheduledDays,
      reps: reps ?? this.reps,
      lapses: lapses ?? this.lapses,
      lastReviewMs: lastReviewMs ?? this.lastReviewMs,
      dueMs: dueMs ?? this.dueMs,
      isLeech: isLeech ?? this.isLeech,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is SrsCardState &&
        other.state == state &&
        other.stability == stability &&
        other.difficulty == difficulty &&
        other.elapsedDays == elapsedDays &&
        other.scheduledDays == scheduledDays &&
        other.reps == reps &&
        other.lapses == lapses &&
        other.lastReviewMs == lastReviewMs &&
        other.dueMs == dueMs &&
        other.isLeech == isLeech;
  }

  @override
  int get hashCode => Object.hash(state, stability, difficulty, elapsedDays,
      scheduledDays, reps, lapses, lastReviewMs, dueMs, isLeech);

  @override
  String toString() {
    return 'SrsCardState(${state.wire}, S=${stability.toStringAsFixed(4)}, '
        'D=${difficulty.toStringAsFixed(4)}, ivl=$scheduledDays, '
        'reps=$reps, lapses=$lapses)';
  }
}

/// Les quatre intervalles proposés à l'étudiant sur les boutons de notation.
class SchedulingPreview {
  const SchedulingPreview({
    required this.again,
    required this.hard,
    required this.good,
    required this.easy,
  });

  final SrsCardState again;
  final SrsCardState hard;
  final SrsCardState good;
  final SrsCardState easy;

  SrsCardState operator [](Rating rating) {
    switch (rating) {
      case Rating.again:
        return again;
      case Rating.hard:
        return hard;
      case Rating.good:
        return good;
      case Rating.easy:
        return easy;
    }
  }

  /// Intervalles en jours, pour l'affichage sous chaque bouton.
  Map<Rating, int> get intervals => <Rating, int>{
        Rating.again: again.scheduledDays,
        Rating.hard: hard.scheduledDays,
        Rating.good: good.scheduledDays,
        Rating.easy: easy.scheduledDays,
      };
}
