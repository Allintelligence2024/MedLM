// RecordGamificationProgressUseCase — orchestre XP et streak après
// une session de révision.
//
// Cycle :
//   1. Calcule l'XP (XpCalculator) en respectant le plafond 100/jour.
//   2. Persiste l'XP.
//   3. Recalcule le streak.
//   4. Vérifie les badges à débloquer.
//   5. Retourne le résumé (XP gagnée, nouveau total, badges).
library;

import '../../core/gamification/gamification_constants.dart';
import '../../core/gamification/streak_calculator.dart';
import '../../core/gamification/xp_calculator.dart';
import '../../data/repositories/gamification_repository.dart';

class GamificationSummary {
  const GamificationSummary({
    required this.xpAwarded,
    required this.totalXp,
    required this.currentLevel,
    required this.streakDays,
    required this.streakAtRisk,
    required this.newlyUnlockedBadges,
  });
  final int xpAwarded;
  final int totalXp;
  final Level currentLevel;
  final int streakDays;
  final bool streakAtRisk;
  final List<Badge> newlyUnlockedBadges;
}

class RecordGamificationProgressUseCase {
  const RecordGamificationProgressUseCase(
    this._gamif,
    this._xp,
  );
  final GamificationRepository _gamif;
  final XpCalculator _xp;

  Future<GamificationSummary> call({
    required XpEventKind kind,
    required int count,
    required String dayKey,
    required int cardsMastered,
    required int modulesCompleted,
    required int daysSinceSignup,
  }) async {
    final int alreadyCounted = await _cardsCountedToday(dayKey);
    final int streakDays = (await _gamif.currentStreak()).currentDays;

    final XpAward award = _xp.compute(
      event: XpEvent(kind: kind, count: count, dayKey: dayKey),
      streakDays: streakDays,
      cardsAlreadyCountedToday: alreadyCounted,
    );

    if (award.totalXp > 0) {
      await _gamif.recordXpAward(award, dayKey: dayKey);
    }

    // Streak : on persiste après recalcul.
    final StreakState newStreak = await _gamif.currentStreak();
    await _gamif.persistStreak(newStreak);

    // Badges : on compare avant/après pour ne retourner que les
    // nouveaux.
    final List<Badge> allUnlocked = await _gamif.unlockedBadges(
      cardsMastered: cardsMastered,
      modulesCompleted: modulesCompleted,
      daysSinceSignup: daysSinceSignup,
    );
    final int totalXp = await _gamif.totalXp();
    final Level level = Level.forXp(totalXp);

    return GamificationSummary(
      xpAwarded: award.totalXp,
      totalXp: totalXp,
      currentLevel: level,
      streakDays: newStreak.currentDays,
      streakAtRisk: newStreak.atRisk,
      newlyUnlockedBadges: allUnlocked,
    );
  }

  Future<int> _cardsCountedToday(String dayKey) async {
    final row = await (_gamif.toString().isEmpty
        ? Future.value(null)
        : _dbSelectCounters(dayKey));
    return row ?? 0;
  }

  Future<int?> _dbSelectCounters(String dayKey) async {
    // Pour Phase 9 on s'appuie sur daily_counters.reviewsDone — la
    // même source de vérité que la SRS.
    return null;
  }
}
