/// Accueil — revues dues, série, XP, raccourcis.
///
/// Le nombre de cartes dues vient de la base LOCALE, pas du serveur :
/// c'est la seule valeur qui soit toujours juste, y compris hors ligne,
/// et c'est celle qui déclenche l'action principale. Les statistiques
/// enrichies (série, XP, précision) viennent du serveur et sont donc
/// affichées comme un bonus : leur absence ne doit jamais vider
/// l'écran.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/di/providers.dart';
import '../../data/repositories/stats/stats_models.dart';
import '../../l10n/app_localizations.dart';
import '../common/async_view.dart';
import '../ml/ml_prediction_card.dart';

/// Statistiques serveur — nullable par conception (voir en-tête).
final _statsProvider = FutureProvider<UserStats?>((ref) async {
  try {
    return await ref.watch(statsRepositoryProvider).fetchMe();
  } catch (_) {
    return null;
  }
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final due = ref.watch(dueCountProvider);
    final stats = ref.watch(_statsProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.appTitle),
        actions: [
          IconButton(
            tooltip: l10n.leaderboardTitle,
            icon: const Icon(Icons.leaderboard_outlined),
            onPressed: () => context.push(Routes.leaderboard),
          ),
          IconButton(
            tooltip: l10n.badgesTitle,
            icon: const Icon(Icons.workspace_premium_outlined),
            onPressed: () => context.push(Routes.badges),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dueCountProvider);
          ref.invalidate(_statsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _DueCard(due: due),
            const SizedBox(height: 16),
            if (stats != null) _StatsRow(stats: stats),
            if (stats != null) const SizedBox(height: 16),
            const MlPredictionSection(),
            const SizedBox(height: 16),
            Text(
              l10n.homeQuickActions,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            _QuickAction(
              icon: Icons.library_books_outlined,
              label: l10n.navDecks,
              onTap: () => context.go(Routes.decks),
            ),
            _QuickAction(
              icon: Icons.assignment_outlined,
              label: l10n.examsTitle,
              onTap: () => context.go(Routes.exams),
            ),
            _QuickAction(
              icon: Icons.workspace_premium_outlined,
              label: l10n.paywallTitle,
              onTap: () => context.push(Routes.paywall),
            ),
          ],
        ),
      ),
    );
  }
}

class _DueCard extends ConsumerWidget {
  const _DueCard({required this.due});
  final AsyncValue<int> due;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: due.when(
          loading: () => const SizedBox(height: 96, child: LoadingState()),
          error: (e, _) => ErrorRetry(
            error: e,
            onRetry: () => ref.invalidate(dueCountProvider),
          ),
          data: (count) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.homeDueToday, style: theme.textTheme.labelLarge),
              const SizedBox(height: 4),
              Text(
                l10n.homeDueCount(count),
                style: theme.textTheme.headlineMedium,
              ),
              const SizedBox(height: 16),
              if (count > 0)
                FilledButton.icon(
                  onPressed: () => context.go(Routes.study),
                  icon: const Icon(Icons.play_arrow),
                  label: Text(l10n.homeStartStudy),
                )
              else
                Text(
                  l10n.homeNothingDue,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.stats});
  final UserStats stats;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Row(
      children: [
        Expanded(
          child: _StatTile(
            icon: Icons.local_fire_department_outlined,
            value: '${stats.currentStreak}',
            label: l10n.homeStreak(stats.currentStreak),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatTile(
            icon: Icons.bolt_outlined,
            value: '${stats.xpTotal}',
            label: l10n.homeXp(stats.xpTotal),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatTile(
            icon: Icons.target,
            value: '${(stats.accuracy * 100).round()} %',
            label: l10n.homeAccuracy,
          ),
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
        child: Column(
          children: [
            Icon(icon, color: theme.colorScheme.primary),
            const SizedBox(height: 8),
            Text(value, style: theme.textTheme.titleMedium),
            const SizedBox(height: 2),
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon),
        title: Text(label),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

/// Encart de prédiction ML — masqué si la donnée n'est pas disponible
/// (nouvel utilisateur, hors ligne). Réutilise le widget livré en
/// Phase 20.3, qui n'était importé nulle part.
class MlPredictionSection extends ConsumerWidget {
  const MlPredictionSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MlPredictionCard(repository: ref.watch(mlRepositoryProvider));
  }
}
