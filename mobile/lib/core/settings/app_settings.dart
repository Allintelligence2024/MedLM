/// Préférences locales — langue, objectif quotidien, rappels.
///
/// Stockées dans la table `user_prefs` déjà présente dans le schéma
/// Drift (même mécanisme que la gamification) : pas de nouvelle
/// dépendance, pas de nouveau fichier à sauvegarder, et la valeur
/// survit à un redémarrage comme au mode avion.
///
/// La langue est ici une préférence **d'affichage** : les textes générés
/// par le serveur (hints, tuteur) restent produits côté serveur dans la
/// langue demandée — c'était déjà le cas et on ne change rien.
library;

import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/local/app_database.dart';
import '../di/providers.dart';

/// Langues supportées par l'interface (audit P1-4).
enum AppLanguage {
  fr('fr'),
  ar('ar'),
  en('en');

  const AppLanguage(this.code);
  final String code;

  Locale get locale => Locale(code);

  static AppLanguage fromCode(String? code) => switch (code) {
        'ar' => AppLanguage.ar,
        'en' => AppLanguage.en,
        _ => AppLanguage.fr,
      };
}

@immutable
class AppSettings {
  const AppSettings({
    this.language = AppLanguage.fr,
    this.dailyGoalCards = 20,
    this.remindersEnabled = false,
    this.onboardingCompleted = false,
  });

  final AppLanguage language;
  final int dailyGoalCards;
  final bool remindersEnabled;
  final bool onboardingCompleted;

  /// Paliers proposés à l'onboarding — volontairement modestes : un
  /// objectif tenable vaut mieux qu'un objectif abandonné.
  static const goalChoices = <int>[10, 20, 30, 50];

  AppSettings copyWith({
    AppLanguage? language,
    int? dailyGoalCards,
    bool? remindersEnabled,
    bool? onboardingCompleted,
  }) =>
      AppSettings(
        language: language ?? this.language,
        dailyGoalCards: dailyGoalCards ?? this.dailyGoalCards,
        remindersEnabled: remindersEnabled ?? this.remindersEnabled,
        onboardingCompleted: onboardingCompleted ?? this.onboardingCompleted,
      );

  @override
  bool operator ==(Object other) =>
      other is AppSettings &&
      other.language == language &&
      other.dailyGoalCards == dailyGoalCards &&
      other.remindersEnabled == remindersEnabled &&
      other.onboardingCompleted == onboardingCompleted;

  @override
  int get hashCode =>
      Object.hash(language, dailyGoalCards, remindersEnabled, onboardingCompleted);
}

/// Clés `user_prefs`. Préfixées pour ne pas entrer en collision avec
/// celles de GamificationRepository (`xp_total`, `streak_days`…).
class SettingsKeys {
  static const language = 'settings.language';
  static const dailyGoal = 'settings.daily_goal';
  static const reminders = 'settings.reminders_enabled';
  static const onboarding = 'settings.onboarding_completed';
}

class AppSettingsController extends AsyncNotifier<AppSettings> {
  AppDatabase get _db => ref.read(appDatabaseProvider);

  @override
  Future<AppSettings> build() async {
    final prefs = await _readAll();
    return AppSettings(
      language: AppLanguage.fromCode(prefs[SettingsKeys.language]),
      dailyGoalCards: int.tryParse(prefs[SettingsKeys.dailyGoal] ?? '') ?? 20,
      remindersEnabled: prefs[SettingsKeys.reminders] == 'true',
      onboardingCompleted: prefs[SettingsKeys.onboarding] == 'true',
    );
  }

  Future<void> setLanguage(AppLanguage language) =>
      _update((s) => s.copyWith(language: language),
          {SettingsKeys.language: language.code});

  Future<void> setDailyGoal(int cards) => _update(
        (s) => s.copyWith(dailyGoalCards: cards),
        {SettingsKeys.dailyGoal: '$cards'},
      );

  Future<void> setRemindersEnabled(bool enabled) => _update(
        (s) => s.copyWith(remindersEnabled: enabled),
        {SettingsKeys.reminders: enabled ? 'true' : 'false'},
      );

  Future<void> completeOnboarding() => _update(
        (s) => s.copyWith(onboardingCompleted: true),
        {SettingsKeys.onboarding: 'true'},
      );

  /// Applique la mutation en mémoire *puis* persiste. Si l'écriture
  /// échoue, on restaure l'état précédent : l'UI ne doit jamais montrer
  /// une préférence qui n'a pas été enregistrée.
  Future<void> _update(
    AppSettings Function(AppSettings) mutate,
    Map<String, String> writes,
  ) async {
    final previous = state.valueOrNull ?? const AppSettings();
    final next = mutate(previous);
    state = AsyncData(next);
    try {
      for (final entry in writes.entries) {
        await _writePref(entry.key, entry.value);
      }
    } catch (e, st) {
      state = AsyncData(previous);
      Error.throwWithStackTrace(e, st);
    }
  }

  Future<Map<String, String>> _readAll() async {
    final rows = await _db.select(_db.userPrefs).get();
    return {for (final r in rows) r.key: r.value};
  }

  Future<void> _writePref(String key, String value) async {
    await _db.into(_db.userPrefs).insertOnConflictUpdate(
          UserPrefsCompanion.insert(userId: 'local', key: key, value: value),
        );
  }
}
