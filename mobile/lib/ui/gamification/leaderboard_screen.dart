// LeaderboardScreen — UI du classement hebdo (Phase 9 bis).
//
// Conformité v2 §9.5 :
//   * Pseudonyme affiché en place de l'identité réelle.
//   * Indicateur "mon rang" si l'utilisateur est opt-in.
//   * Bouton opt-in / opt-out accessible en bas.
//   * Tri déterministe (déjà fait côté serveur).
//
// i18n FR/AR/EN : fait (audit P1-4). Les chaînes vivent dans
// lib/l10n/app_*.arb et `check_mobile_i18n.py` empêche la régression.
library;

import 'package:flutter/material.dart';

import '../../data/repositories/leaderboard/leaderboard_models.dart';
import '../../data/repositories/leaderboard/leaderboard_repository.dart';
import '../../l10n/app_localizations.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key, required this.repository});
  final LeaderboardRepository repository;

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  late Future<LeaderboardSnapshot> _future;
  bool _isOptIn = false;

  @override
  void initState() {
    super.initState();
    _future = widget.repository.fetchTop();
    widget.repository.isOptIn().then((v) {
      if (mounted) setState(() => _isOptIn = v);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.leaderboardTitle),
        actions: [
          IconButton(
            tooltip: l10n.actionRefresh,
            icon: const Icon(Icons.refresh),
            onPressed: () {
              setState(() {
                _future = widget.repository.fetchTop();
              });
            },
          ),
        ],
      ),
      body: FutureBuilder<LeaderboardSnapshot>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Text(
                  l10n.leaderboardError,
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          final board = snap.requireData;
          return Column(
            children: [
              _Header(weekIso: board.weekIso, myRank: board.myRank, isOptIn: _isOptIn),
              if (board.entries.isEmpty)
                const Expanded(
                  child: Center(child: Text('Aucun participant cette semaine.')),
                )
              else
                Expanded(
                  child: ListView.separated(
                    itemCount: board.entries.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) => _EntryTile(entry: board.entries[i]),
                  ),
                ),
              _OptInFooter(
                isOptIn: _isOptIn,
                onOptIn: () => _showOptInDialog(context),
                onOptOut: () async {
                  await widget.repository.optOut();
                  if (!mounted) return;
                  setState(() => _isOptIn = false);
                },
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _showOptInDialog(BuildContext context) async {
    final controller = TextEditingController();
    String? faculty;
    int? studyYear;
    final formKey = GlobalKey<FormState>();
    // Résolu AVANT showDialog : le contexte du dialogue est distinct,
    // mais les deux partagent les mêmes Localizations.
    final dialogL10n = AppLocalizations.of(context);
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(dialogL10n.leaderboardOptIn),
        content: Form(
          key: formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: controller,
                  decoration: InputDecoration(
                    labelText: dialogL10n.leaderboardPseudonym,
                  ),
                  validator: (v) {
                    final s = v?.trim() ?? '';
                    if (s.length < 3 || s.length > 20) {
                      return dialogL10n.leaderboardPseudonymLength;
                    }
                    if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(s)) {
                      return dialogL10n.leaderboardPseudonymAlnum;
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  decoration: InputDecoration(
                    labelText: dialogL10n.leaderboardFacultyOptional,
                  ),
                  onChanged: (v) => faculty = v.trim().isEmpty ? null : v.trim(),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  decoration: InputDecoration(
                    labelText: dialogL10n.leaderboardYearRange,
                  ),
                  keyboardType: TextInputType.number,
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    studyYear = (n != null && n >= 1 && n <= 10) ? n : null;
                  },
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(dialogL10n.actionCancel),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.of(ctx).pop(true);
              }
            },
            child: Text(dialogL10n.actionConfirm),
          ),
        ],
      ),
    );
    if (result != true || !mounted) return;
    try {
      await widget.repository.optIn(
        pseudonym: controller.text.trim(),
        faculty: faculty,
        studyYear: studyYear,
      );
      if (!mounted) return;
      setState(() {
        _isOptIn = true;
        _future = widget.repository.fetchTop();
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).leaderboardOptInFailed),
        ),
      );
    }
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.weekIso, required this.myRank, required this.isOptIn});
  final String weekIso;
  final int? myRank;
  final bool isOptIn;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      color: Theme.of(context).colorScheme.primaryContainer,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Semaine $weekIso', style: Theme.of(context).textTheme.titleMedium),
          if (isOptIn && myRank != null) ...[
            const SizedBox(height: 4),
            Text('Votre rang : #$myRank'),
          ] else if (!isOptIn) ...[
            const SizedBox(height: 4),
            const Text("Participez au classement pour voir votre rang."),
          ],
        ],
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  const _EntryTile({required this.entry});
  final LeaderboardEntry entry;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: _rankColor(entry.rank),
        child: Text('#${entry.rank}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      title: Text(entry.pseudonym),
      subtitle: Text(
        [
          if (entry.faculty != null) entry.faculty!,
          if (entry.studyYear != null) 'P${entry.studyYear}',
        ].join(' • '),
      ),
      trailing: Text(
        '${entry.xpWeek} XP',
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
    );
  }

  Color _rankColor(int rank) {
    if (rank == 1) return Colors.amber;
    if (rank == 2) return Colors.grey.shade400;
    if (rank == 3) return Colors.brown.shade300;
    return Colors.blueGrey;
  }
}

class _OptInFooter extends StatelessWidget {
  const _OptInFooter({required this.isOptIn, required this.onOptIn, required this.onOptOut});
  final bool isOptIn;
  final VoidCallback onOptIn;
  final VoidCallback onOptOut;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: isOptIn
            ? OutlinedButton.icon(
                onPressed: onOptOut,
                icon: const Icon(Icons.exit_to_app),
                label: Text(AppLocalizations.of(context).leaderboardOptOutGdpr),
              )
            : FilledButton.icon(
                onPressed: onOptIn,
                icon: const Icon(Icons.emoji_events),
                label: Text(AppLocalizations.of(context).leaderboardOptIn),
              ),
      ),
    );
  }
}
