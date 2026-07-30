// GamificationRepository — persistance locale de l'XP, du streak et
// des badges débloqués.
//
// Le calcul (XpCalculator, StreakCalculator) reste pur, dans
// core/gamification/. Ce repository se contente de lire/écrire
// dans SQLite via Drift.
library;

import 'package:drift/drift.dart';

import '../../core/gamification/gamification_constants.dart';
import '../../core/gamification/streak_calculator.dart';
import '../../core/gamification/xp_calculator.dart';
import '../local/app_database.dart';

class GamificationRepository {
  GamificationRepository(this._db);
  final AppDatabase _db;

  static const _kXp = 'xp_total';
  static const _kStreak = 'streak_days';
  static const _kFreezes = 'freezes_used_month';
  static const _kStreakLastDay = 'streak_last_day';
  static const _kEnglishEnabled = 'english_enabled';
  static const _kBadges = 'badges_unlocked';

  Future<int> totalXp() async {
    final row = await _readPref(_kXp);
    return int.tryParse(row ?? '0') ?? 0;
  }

  Future<StreakState> currentStreak({DateTime? now}) async {
    final s = const StreakCalculator();
    // Pour Phase 9, on reconstruit la liste des dayKeys à partir
    // des study_sessions (un sessionId = un dayKey si ≥ 10 cartes).
    // Version simplifiée : on lit les `day_key` depuis daily_counters.
    final List<DailyCounterRow> counters = await _db.select(_db.dailyCounters).get();
    final List<String> days = <String>[];
    for (final c in counters) {
      // On ne compte que les jours où ≥ minCardsForStreak cartes ont
      // été vues. `reviews_done` est un proxy correct.
      if (c.reviewsDone >= GamificationConstants.minCardsPerDayForStreak) {
        days.add(c.dayKey);
      }
    }
    final int freezes = int.tryParse(await _readPref(_kFreezes) ?? '0') ?? 0;
    return s.compute(
      reviewDayKeys: days,
      freezesUsedThisMonth: freezes,
      now: now ?? DateTime.now(),
    );
  }

  Future<void> recordXpAward(XpAward award, {required String dayKey}) async {
    final int current = await totalXp();
    final int newXp = current + award.totalXp;
    await _writePref(_kXp, newXp.toString());
  }

  Future<void> persistStreak(StreakState state) async {
    await _writePref(_kStreak, state.currentDays.toString());
    await _writePref(_kFreezes, state.freezesUsedThisMonth.toString());
    if (state.lastReviewDayKey != null) {
      await _writePref(_kStreakLastDay, state.lastReviewDayKey!);
    }
  }

  Future<Level> currentLevel() async {
    return Level.forXp(await totalXp());
  }

  Future<List<Badge>> unlockedBadges({
    required int cardsMastered,
    required int modulesCompleted,
    required int daysSinceSignup,
  }) async {
    final streak = await currentStreak();
    final english = (await _readPref(_kEnglishEnabled)) == 'true';
    final ctx = BadgeContext(
      streakDays: streak.currentDays,
      totalXp: await totalXp(),
      cardsMastered: cardsMastered,
      modulesCompleted: modulesCompleted,
      daysSinceSignup: daysSinceSignup,
      englishEnabled: english,
    );
    return Badges.all.where((b) => b.criterion(ctx)).toList();
  }

  Future<void> setEnglishEnabled(bool enabled) async {
    await _writePref(_kEnglishEnabled, enabled ? 'true' : 'false');
  }

  // ── user_prefs (helper) ──────────────────────────────────────

  Future<String?> _readPref(String key) async {
    final rows = await (_db.select(_db.userPrefs)
          ..where(($t) => $t.key.equals(key)))
        .get();
    return rows.isEmpty ? null : rows.first.value;
  }

  Future<void> _writePref(String key, String value) async {
    await _db.into(_db.userPrefs).insertOnConflictUpdate(
          UserPrefsCompanion.insert(userId: 'local', key: key, value: value),
        );
  }
}
