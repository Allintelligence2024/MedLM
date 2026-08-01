/// Résultat d'un examen blanc.
///
/// Le score affiché est celui **calculé par le serveur** : le client ne
/// recompte rien (il ne connaît pas les bonnes réponses, et c'est
/// délibéré).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/router.dart';
import '../../core/di/providers.dart';
import '../../l10n/app_localizations.dart';

class ExamResultScreen extends ConsumerWidget {
  const ExamResultScreen({super.key, required this.result});

  final Map<String, dynamic> result;

  /// Normalise le score en pourcentage entier.
  ///
  /// Le backend renvoie tantôt un ratio 0..1, tantôt un pourcentage
  /// déjà calculé selon l'endpoint : on accepte les deux plutôt que de
  /// risquer d'afficher « 1 % » à quelqu'un qui a tout juste.
  static int scorePercent(Map<String, dynamic> result) {
    final raw = result['score'] ?? result['score_percent'] ?? result['ratio'];
    if (raw is! num) return 0;
    final value = raw.toDouble();
    final percent = value <= 1.0 ? value * 100 : value;
    return percent.round().clamp(0, 100);
  }

  static bool passed(Map<String, dynamic> result) {
    final explicit = result['passed'];
    if (explicit is bool) return explicit;
    return scorePercent(result) >= 50;
  }

  /// Identifiant de la tentative, quelle que soit l'enveloppe.
  static String? _attemptId(Map<String, dynamic> result) {
    final id = result['attempt_id'] ?? result['id'];
    return id is String && id.isNotEmpty ? id : null;
  }

  static Future<void> _share(
    BuildContext context,
    WidgetRef ref,
    String attemptId,
  ) async {
    final l10n = AppLocalizations.of(context);
    try {
      final card = await ref
          .read(apiClientProvider)
          .createShare(attemptId: attemptId);
      final url = (card['share_url'] ?? card['url'] ?? '').toString();
      if (url.isEmpty) throw StateError('share_url absent');
      await Share.share(url, subject: l10n.appTitle);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.shareFailed)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final percent = scorePercent(result);
    final ok = passed(result);
    final autoSubmitted = result['auto_submitted'] == true;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(l10n.examsTitle),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Icon(
                ok ? Icons.check_circle_outline : Icons.info_outline,
                size: 64,
                color: ok ? theme.colorScheme.primary : theme.colorScheme.error,
              ),
              const SizedBox(height: 24),
              Text(
                l10n.examsScore(percent),
                style: theme.textTheme.headlineMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                ok ? l10n.examsPassed : l10n.examsFailed,
                style: theme.textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              if (autoSubmitted) ...[
                const SizedBox(height: 16),
                Text(
                  l10n.examsExpired,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              const Spacer(),
              // Partage social ciblé (Phase 15.5) : l'endpoint
              // /v1/share existait sans aucun appelant côté mobile.
              // Le serveur impose le pseudonyme et refuse tout
              // re-partage automatique (v2 §13).
              if (_attemptId(result) != null)
                OutlinedButton.icon(
                  onPressed: () => _share(context, ref, _attemptId(result)!),
                  icon: const Icon(Icons.share_outlined),
                  label: Text(l10n.shareProgress),
                ),
              if (_attemptId(result) != null) const SizedBox(height: 12),
              FilledButton(
                onPressed: () => context.go(Routes.exams),
                child: Text(l10n.actionClose),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => context.go(Routes.study),
                child: Text(l10n.homeStartStudy),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
