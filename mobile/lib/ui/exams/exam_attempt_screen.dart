/// Écran de passation d'examen — QCM, timer serveur, anti-triche.
///
/// Trois garanties portées par cet écran :
///   * **le temps vient du serveur** (`expires_at`) : le compte à
///     rebours n'est qu'un affichage, et l'expiration déclenche une
///     soumission automatique ;
///   * **chaque réponse est envoyée dès qu'elle est donnée** : fermer
///     l'application ne fait pas perdre la copie ;
///   * **les événements anti-triche sont journalisés** via
///     AntiCheatScope (perte de focus, retour au premier plan).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/anticheat/exam_anticheat.dart';
import '../../core/di/providers.dart';
import '../../l10n/app_localizations.dart';
import '../common/async_view.dart';
import 'exam_timer.dart';

class ExamAttemptScreen extends ConsumerStatefulWidget {
  const ExamAttemptScreen({super.key, required this.attempt});

  /// Réponse de `POST /v1/exams/templates/:id/generate`.
  final Map<String, dynamic> attempt;

  @override
  ConsumerState<ExamAttemptScreen> createState() => _ExamAttemptScreenState();
}

class _ExamAttemptScreenState extends ConsumerState<ExamAttemptScreen> {
  late final List<Map<String, dynamic>> _questions;
  late final DateTime? _expiresAt;
  late final String _attemptId;
  final Map<String, Object?> _answers = {};
  int _index = 0;
  Timer? _ticker;
  Duration _remaining = Duration.zero;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _attemptId = (widget.attempt['attempt_id'] ?? widget.attempt['id'] ?? '')
        .toString();
    _questions = parseQuestions(widget.attempt);
    _expiresAt = parseExpiry(widget.attempt);
    _startTicker();
  }

  void _startTicker() {
    if (_expiresAt == null) return;
    _remaining = remaining(_expiresAt!, DateTime.now().toUtc());
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      final now = DateTime.now().toUtc();
      if (isExpired(_expiresAt, now)) {
        _ticker?.cancel();
        // Le temps est écoulé : on soumet ce qu'on a. Ne rien faire
        // laisserait l'utilisateur devant un écran figé alors que le
        // serveur considère déjà la tentative close.
        unawaited(_submit(auto: true));
        return;
      }
      setState(() => _remaining = remaining(_expiresAt!, now));
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _answer(String questionId, Object? value) async {
    setState(() => _answers[questionId] = value);
    try {
      await ref.read(apiClientProvider).saveExamAnswer(
            attemptId: _attemptId,
            questionId: questionId,
            answer: value,
          );
    } catch (_) {
      // La réponse reste en mémoire et repartira avec la soumission
      // finale : un blip réseau ne doit pas effacer un choix.
    }
  }

  Future<void> _submit({bool auto = false}) async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final result = await ref.read(apiClientProvider).submitExam(
            attemptId: _attemptId,
            answers: _answers,
          );
      if (!mounted) return;
      context.pushReplacement(Routes.examResult, extra: {
        ...result,
        'auto_submitted': auto,
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(describeError(context, e))),
      );
    }
  }

  Future<void> _confirmSubmit() async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(l10n.examsSubmitConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.actionCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.examsSubmit),
          ),
        ],
      ),
    );
    if (ok ?? false) await _submit();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_questions.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.examsTitle)),
        body: EmptyState(
          message: l10n.examsEmpty,
          icon: Icons.assignment_outlined,
        ),
      );
    }

    final question = _questions[_index];
    final questionId = (question['id'] ?? '$_index').toString();
    final controller = AntiCheatController(
      api: ref.read(apiClientProvider),
      attemptId: _attemptId,
    );

    return AntiCheatScope(
      controller: controller,
      child: PopScope(
        // Quitter par erreur en plein examen chronométré serait
        // brutal : on force le passage par « Terminer ».
        canPop: false,
        child: Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            title: Text(
              l10n.examsQuestionOf(_index + 1, _questions.length),
            ),
            actions: [
              if (_expiresAt != null)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: Text(
                      formatRemaining(_remaining),
                      style: TextStyle(
                        fontFeatures: const [],
                        fontWeight: FontWeight.bold,
                        color: isUrgent(_remaining)
                            ? Theme.of(context).colorScheme.error
                            : null,
                      ),
                    ),
                  ),
                ),
            ],
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(4),
              child: LinearProgressIndicator(
                value: (_index + 1) / _questions.length,
                minHeight: 4,
              ),
            ),
          ),
          body: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: _QuestionBody(
                      question: question,
                      selected: _answers[questionId],
                      onSelect: (v) => _answer(questionId, v),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      if (_index > 0)
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => setState(() => _index--),
                            child: Text(l10n.actionBack),
                          ),
                        ),
                      if (_index > 0) const SizedBox(width: 12),
                      Expanded(
                        child: _index < _questions.length - 1
                            ? FilledButton(
                                onPressed: () => setState(() => _index++),
                                child: Text(l10n.actionNext),
                              )
                            : FilledButton(
                                onPressed: _submitting ? null : _confirmSubmit,
                                child: _submitting
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : Text(l10n.examsSubmit),
                              ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _QuestionBody extends StatelessWidget {
  const _QuestionBody({
    required this.question,
    required this.selected,
    required this.onSelect,
  });

  final Map<String, dynamic> question;
  final Object? selected;
  final ValueChanged<Object?> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final prompt =
        (question['prompt'] ?? question['question'] ?? question['text'] ?? '')
            .toString();
    final rawChoices = question['choices'] ?? question['options'];
    final choices = rawChoices is List ? rawChoices : const [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(prompt, style: theme.textTheme.titleMedium),
        const SizedBox(height: 24),
        for (var i = 0; i < choices.length; i++)
          _ChoiceTile(
            label: _choiceLabel(choices[i]),
            value: _choiceValue(choices[i], i),
            groupValue: selected,
            onChanged: onSelect,
          ),
      ],
    );
  }

  static String _choiceLabel(Object? choice) {
    if (choice is Map) {
      return (choice['label'] ?? choice['text'] ?? choice['value'] ?? '')
          .toString();
    }
    return choice.toString();
  }

  static Object _choiceValue(Object? choice, int index) {
    if (choice is Map) return (choice['id'] ?? choice['value'] ?? index);
    return index;
  }
}

class _ChoiceTile extends StatelessWidget {
  const _ChoiceTile({
    required this.label,
    required this.value,
    required this.groupValue,
    required this.onChanged,
  });

  final String label;
  final Object value;
  final Object? groupValue;
  final ValueChanged<Object?> onChanged;

  @override
  Widget build(BuildContext context) {
    final isSelected = groupValue == value;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: isSelected
          ? Theme.of(context).colorScheme.primaryContainer
          : null,
      child: ListTile(
        title: Text(label),
        leading: Icon(
          isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
        ),
        onTap: () => onChanged(value),
      ),
    );
  }
}
