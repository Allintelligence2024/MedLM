/// Liste des examens blancs disponibles.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/di/providers.dart';
import '../../l10n/app_localizations.dart';
import '../common/async_view.dart';

final examTemplatesProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ref.watch(apiClientProvider).listExamTemplates();
});

class ExamListScreen extends ConsumerWidget {
  const ExamListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final templates = ref.watch(examTemplatesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.examsTitle)),
      body: templates.when(
        loading: () => const LoadingState(),
        error: (e, _) => ErrorRetry(
          error: e,
          onRetry: () => ref.invalidate(examTemplatesProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return EmptyState(
              message: l10n.examsEmpty,
              icon: Icons.assignment_outlined,
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(examTemplatesProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              itemBuilder: (context, i) => _TemplateTile(template: items[i]),
            ),
          );
        },
      ),
    );
  }
}

class _TemplateTile extends ConsumerStatefulWidget {
  const _TemplateTile({required this.template});
  final Map<String, dynamic> template;

  @override
  ConsumerState<_TemplateTile> createState() => _TemplateTileState();
}

class _TemplateTileState extends ConsumerState<_TemplateTile> {
  bool _busy = false;

  Future<void> _start() async {
    final id = (widget.template['id'] ?? widget.template['template_id'])?.toString();
    if (id == null) return;
    setState(() => _busy = true);
    try {
      // Le serveur génère le sujet ET pose le timer : l'heure de fin
      // qu'il renvoie fait autorité (v2 §10). Le client ne décide de
      // rien, il affiche un compte à rebours.
      final attempt = await ref.read(apiClientProvider).generateExam(id);
      if (mounted) context.push(Routes.examAttempt, extra: attempt);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(describeError(context, e))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final t = widget.template;
    final questionCount = (t['question_count'] as num?)?.toInt();
    final durationMin = (t['duration_minutes'] as num?)?.toInt();

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text((t['name_fr'] ?? t['name'] ?? l10n.examsTitle).toString()),
        subtitle: Text(
          [
            if (questionCount != null) '$questionCount QCM',
            if (durationMin != null) '$durationMin min',
          ].join(' · '),
        ),
        trailing: _busy
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.play_circle_outline),
        onTap: _busy ? null : _start,
      ),
    );
  }
}
