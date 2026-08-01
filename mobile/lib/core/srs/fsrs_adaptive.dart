/// FSRS adaptatif — application locale des poids ajustés (Phase 19.6).
///
/// MIROIR LIGNE À LIGNE de `backend/src/ai/adaptive/adaptive.service.ts`
/// (Phase 18.4) : mêmes seuils, mêmes facteurs, mêmes bornes. Si l'un
/// change, l'autre DOIT changer — verrouillé par
/// `tools/dart_parity_check.py` et les golden tests
/// `mobile/test/srs/adaptive_golden_test.dart`.
///
/// Deux chemins d'obtention des poids personnalisés :
///   1. **Serveur** : `GET /v1/ai/adaptive/profile` →
///      [FsrsAdaptive.parametersFromAdjustment] (bornage défensif inclus) ;
///   2. **Local (offline)** : [FsrsAdaptive.computeAdjustment] recalcule
///      l'ajustement depuis l'historique local de revues.
///
/// Dans les deux cas les poids restent bornés dans [0.5×, 2×] de la
/// base : jamais de dérive silencieuse (doc v2 §13).
library;

import 'fsrs_parameters.dart';

/// Seuils adaptatifs — alignés sur `ADAPTIVE_THRESHOLDS` côté backend.
/// Toute modification ici = entrée de changelog + parité backend.
abstract final class AdaptiveThresholds {
  /// Ajustement actif seulement avec ≥ 100 revues dans la fenêtre.
  static const int adjustMinReviews = 100;

  /// Utilisateur fort : taux d'échec ≤ 5 % et ≥ 200 revues.
  static const double strongMaxLapseRate = 0.05;
  static const int strongMinReviews = 200;

  /// Utilisateur fragile : taux d'échec ≥ 30 %.
  static const double fragileMinLapseRate = 0.3;

  /// Facteurs d'ajustement (conservateurs, justifiés).
  static const double fragileW11Factor = 1.15;
  static const double strongW8Factor = 1.05;

  /// Bornes des ajustements de poids.
  static const double weightMinFactor = 0.5;
  static const double weightMaxFactor = 2.0;
}

/// Résultat d'un calcul d'ajustement (local ou servi).
class AdaptiveAdjustment {
  const AdaptiveAdjustment({
    required this.weights,
    required this.changedIndices,
    required this.reasons,
  });

  /// Les 19 poids effectivement utilisables (déjà bornés).
  final List<double> weights;

  /// Indices des poids modifiés (vide = moteur par défaut).
  final List<int> changedIndices;

  /// Justification explicable (v2 §13) — jamais de drift opaque.
  final List<String> reasons;

  bool get active => changedIndices.isNotEmpty;
}

abstract final class FsrsAdaptive {
  /// Garde-fou : borne chaque poids dans [0.5×, 2×] de [baseWeights].
  static List<double> clampWeights(
    List<double> weights, [
    List<double> baseWeights = kDefaultFsrsWeights,
  ]) {
    return List<double>.generate(weights.length, (i) {
      final base = i < baseWeights.length ? baseWeights[i] : weights[i];
      final lo = base * AdaptiveThresholds.weightMinFactor;
      final hi = base * AdaptiveThresholds.weightMaxFactor;
      return weights[i] < lo
          ? lo
          : (weights[i] > hi ? hi : weights[i]);
    });
  }

  /// Ajustement FSRS personnalisé — calcul LOCAL, hors-ligne.
  ///
  ///   * fragile (échecs ≥ 30 %, ≥ 100 revues) → w[11] × 1.15 : la
  ///     stabilité post-oubli se reconstruit plus vite (l'utilisateur
  ///     ne s'épuise pas sur ses leech) ;
  ///   * fort (échecs ≤ 5 %, ≥ 200 revues) → w[8] × 1.05 : les rappels
  ///     réussis espacent un peu plus (moins de révisions inutiles).
  static AdaptiveAdjustment computeAdjustment({
    required int totalReviews,
    required double lapseRate,
    List<double> baseWeights = kDefaultFsrsWeights,
  }) {
    final weights = List<double>.of(baseWeights);
    final changedIndices = <int>[];
    final reasons = <String>[];

    if (totalReviews < AdaptiveThresholds.adjustMinReviews) {
      return AdaptiveAdjustment(
        weights: weights,
        changedIndices: changedIndices,
        reasons: reasons,
      );
    }
    if (lapseRate >= AdaptiveThresholds.fragileMinLapseRate) {
      weights[11] = baseWeights[11] * AdaptiveThresholds.fragileW11Factor;
      changedIndices.add(11);
      reasons.add(
        'lapse_rate élevé (${(lapseRate * 100).round()}% ≥ 30%) → w11 ×1.15',
      );
    } else if (lapseRate <= AdaptiveThresholds.strongMaxLapseRate &&
        totalReviews >= AdaptiveThresholds.strongMinReviews) {
      weights[8] = baseWeights[8] * AdaptiveThresholds.strongW8Factor;
      changedIndices.add(8);
      reasons.add(
        'lapse_rate faible (${(lapseRate * 100).round()}% ≤ 5%) → w8 ×1.05',
      );
    }
    return AdaptiveAdjustment(
      weights: clampWeights(weights, baseWeights),
      changedIndices: changedIndices,
      reasons: reasons,
    );
  }

  /// Reprend les poids servis par l'endpoint adaptatif et les borne
  /// une seconde fois côté client (défense en profondeur).
  ///
  /// Toute entrée invalide (pas 19 poids, poids nul/négatif) retombe
  /// sur le moteur par défaut — le SRS local ne casse jamais.
  static FsrsParameters parametersFromAdjustment(dynamic adjustment) {
    final raw =
        adjustment == null ? const <double>[] : _weightsOf(adjustment);
    if (raw.length != 19 || raw.any((w) => w <= 0)) {
      return const FsrsParameters();
    }
    return FsrsParameters(weights: clampWeights(raw));
  }

  static List<double> _weightsOf(dynamic adjustment) {
    // Accepte à la fois AdaptiveProfile.fsrsAdjustment (data layer)
    // et tout objet exposant `weights` — sans coupler les couches.
    try {
      final List<dynamic> w = (adjustment as dynamic).weights as List<dynamic>;
      return w.map((e) => (e as num).toDouble()).toList();
    } catch (_) {
      return const <double>[];
    }
  }
}
