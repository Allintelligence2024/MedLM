// StreakCalculator — calcule le streak courant.
//
// Règles :
//   * Streak = nombre de jours consécutifs (en heure LOCALE) avec au
//     moins 10 cartes dues révisées.
//   * Tolérance : si on a révisé hier et qu'on n'a pas encore révisé
//     aujourd'hui, le streak est "en danger" mais pas cassé tant
//     qu'on est dans la fenêtre `streakGraceHours` (36h par défaut).
//   * Freeze : 2/mois, utilisables automatiquement (pas d'UI pour
//     l'instant — l'algorithme décide).
library;

import 'gamification_constants.dart';

class StreakState {
  const StreakState({
    required this.currentDays,
    required this.freezesUsedThisMonth,
    required this.lastReviewDayKey,
    required this.atRisk,
  });
  final int currentDays;
  final int freezesUsedThisMonth;
  final String? lastReviewDayKey; // YYYY-MM-DD, null si jamais révisé
  final bool atRisk;
}

class StreakCalculator {
  const StreakCalculator();

  /// Calcule le streak courant à partir de l'historique des
  /// `dayKey` (YYYY-MM-DD) où au moins N cartes ont été révisées.
  StreakState compute({
    required List<String> reviewDayKeys,
    required int freezesUsedThisMonth,
    required DateTime now,
  }) {
    if (reviewDayKeys.isEmpty) {
      return StreakState(
        currentDays: 0,
        freezesUsedThisMonth: freezesUsedThisMonth,
        lastReviewDayKey: null,
        atRisk: false,
      );
    }
    // 1. Normalise et dédoublonne.
    final Set<String> uniq = reviewDayKeys.toSet();

    // 2. Trouve le dernier jour où on a révisé ≥ N cartes.
    final sortedDesc = uniq.toList()..sort((a, b) => b.compareTo(a));
    final last = sortedDesc.first;
    final today = _formatDay(now);
    final yesterday = _formatDay(now.subtract(const Duration(days: 1)));

    int current = 0;
    bool atRisk = false;
    DateTime cursor = _parseDay(last);

    if (last == today) {
      current = 1;
    } else if (last == yesterday) {
      current = 1;
      atRisk = true; // streak en danger, doit réviser aujourd'hui
    } else {
      // Le dernier jour de revue est trop ancien. Si on a un freeze
      // disponible, on "consomme" un jour pour préserver le streak.
      // (Simplification Phase 9 : on l'auto-consomme si dispo.)
      if (freezesUsedThisMonth < GamificationConstants.maxFreezesPerMonth) {
        current = 1; // freeze appliqué implicitement
        atRisk = true;
        freezesUsedThisMonth++; // le caller persiste cet incrément
      } else {
        return StreakState(
          currentDays: 0,
          freezesUsedThisMonth: freezesUsedThisMonth,
          lastReviewDayKey: last,
          atRisk: false,
        );
      }
    }

    // 3. Continue à remonter tant que les jours sont consécutifs.
    for (int i = 1; i < sortedDesc.length; i++) {
      final prev = sortedDesc[i];
      final expected = _formatDay(cursor.subtract(const Duration(days: 1)));
      if (prev == expected) {
        current++;
        cursor = _parseDay(prev);
      } else {
        break;
      }
    }

    return StreakState(
      currentDays: current,
      freezesUsedThisMonth: freezesUsedThisMonth,
      lastReviewDayKey: last,
      atRisk: atRisk,
    );
  }

  /// Est-ce que le `dayKey` (YYYY-MM-DD) respecte le minimum de cartes
  /// par jour pour être éligible au streak ?
  bool isEligibleDay({required String dayKey, required int cardsReviewed}) {
    return cardsReviewed >=
        GamificationConstants.minCardsPerDayForStreak;
  }

  String _formatDay(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  DateTime _parseDay(String s) {
    final parts = s.split('-');
    return DateTime(
      int.parse(parts[0]),
      int.parse(parts[1]),
      int.parse(parts[2]),
    );
  }
}
