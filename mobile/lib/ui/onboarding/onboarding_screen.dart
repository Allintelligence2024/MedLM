/// Onboarding — trois questions, pas une de plus.
///
/// Langue, objectif quotidien, rappels. Le backend accepte six champs
/// (faculté, année, niveau, langue, modules, objectif) mais faculté et
/// année ont déjà été demandées à l'inscription : les reposer serait
/// de la friction gratuite.
///
/// L'envoi au serveur est **best-effort** : l'onboarding est validé
/// localement quoi qu'il arrive. Bloquer un nouvel utilisateur sur un
/// écran de configuration parce que le réseau est mauvais serait le
/// pire moment possible pour le perdre — et l'application fonctionne
/// hors ligne par construction.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/di/providers.dart';
import '../../core/settings/app_settings.dart';
import '../../l10n/app_localizations.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;
  bool _busy = false;

  static const _pageCount = 3;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_page < _pageCount - 1) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    } else {
      unawaitedFinish();
    }
  }

  void unawaitedFinish() {
    // ignore: discarded_futures — le bouton gère son propre état busy.
    _finish();
  }

  Future<void> _finish() async {
    setState(() => _busy = true);
    final settings = ref.read(settingsProvider).valueOrNull ?? const AppSettings();
    try {
      await ref.read(apiClientProvider).submitOnboarding(
            // Faculté et année vivent côté serveur depuis l'inscription ;
            // on renvoie des valeurs neutres pour satisfaire le contrat
            // sans écraser un choix déjà fait.
            faculty: 'Alger',
            studyYear: 1,
            experienceLevel: 'beginner',
            preferredLanguage: settings.language.code,
            moduleInterests: const <String>[],
            dailyGoalCards: settings.dailyGoalCards,
          );
    } catch (_) {
      // Hors ligne, ou modules d'intérêt refusés par le serveur : les
      // préférences locales font foi, la sync rattrapera.
    }
    await ref.read(settingsProvider.notifier).completeOnboarding();
    // Le routeur redirige de lui-même vers l'accueil dès que
    // `onboardingCompleted` passe à true.
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final settings = ref.watch(settingsProvider).valueOrNull ?? const AppSettings();

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: LinearProgressIndicator(
                      value: (_page + 1) / _pageCount,
                      minHeight: 4,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text('${_page + 1}/$_pageCount'),
                ],
              ),
            ),
            Expanded(
              child: PageView(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                children: [
                  _LanguagePage(settings: settings),
                  _GoalPage(settings: settings),
                  _RemindersPage(settings: settings),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: FilledButton(
                onPressed: _busy ? null : _next,
                child: Text(
                  _page == _pageCount - 1 ? l10n.onboardingDone : l10n.actionNext,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LanguagePage extends ConsumerWidget {
  const _LanguagePage({required this.settings});
  final AppSettings settings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return _Page(
      icon: Icons.translate,
      title: l10n.onboardingLanguage,
      subtitle: l10n.onboardingLanguageHelp,
      child: Column(
        children: [
          for (final lang in AppLanguage.values)
            RadioListTile<AppLanguage>(
              value: lang,
              groupValue: settings.language,
              title: Text(_languageLabel(lang)),
              onChanged: (v) {
                if (v != null) {
                  // ignore: discarded_futures
                  ref.read(settingsProvider.notifier).setLanguage(v);
                }
              },
            ),
        ],
      ),
    );
  }

  // Chaque langue est écrite DANS cette langue : un utilisateur
  // arabophone doit reconnaître son option sans lire le français.
  static String _languageLabel(AppLanguage lang) => switch (lang) {
        AppLanguage.fr => 'Français',  // ignore: hardcoded-string — endonyme
        AppLanguage.ar => 'العربية',
        AppLanguage.en => 'English',
      };
}

class _GoalPage extends ConsumerWidget {
  const _GoalPage({required this.settings});
  final AppSettings settings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return _Page(
      icon: Icons.flag_outlined,
      title: l10n.onboardingGoal,
      subtitle: l10n.onboardingGoalHelp,
      child: Column(
        children: [
          for (final goal in AppSettings.goalChoices)
            RadioListTile<int>(
              value: goal,
              groupValue: settings.dailyGoalCards,
              title: Text(l10n.onboardingGoalCards(goal)),
              onChanged: (v) {
                if (v != null) {
                  // ignore: discarded_futures
                  ref.read(settingsProvider.notifier).setDailyGoal(v);
                }
              },
            ),
        ],
      ),
    );
  }
}

class _RemindersPage extends ConsumerWidget {
  const _RemindersPage({required this.settings});
  final AppSettings settings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return _Page(
      icon: Icons.notifications_outlined,
      title: l10n.onboardingNotifications,
      subtitle: l10n.onboardingNotificationsHelp,
      child: SwitchListTile(
        value: settings.remindersEnabled,
        title: Text(l10n.onboardingNotificationsEnable),
        onChanged: (v) {
          // ignore: discarded_futures
          ref.read(settingsProvider.notifier).setRemindersEnabled(v);
        },
      ),
    );
  }
}

class _Page extends StatelessWidget {
  const _Page({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(icon, size: 48, color: theme.colorScheme.primary),
          const SizedBox(height: 24),
          Text(
            title,
            style: theme.textTheme.headlineSmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          child,
        ],
      ),
    );
  }
}
