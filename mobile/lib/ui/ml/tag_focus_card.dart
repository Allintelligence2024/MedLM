// TagFocusCard — carte « où concentrer l'effort » (Phase 20.3).
//
// Branchée sur GET /v1/ml/tag-focus via MlRepository. Chaque puce rend
// la justification servie (explicable v2 §13) dans un tooltip/appui
// long. Offline → la carte s'efface silencieusement.
library;

import 'package:flutter/material.dart';

import '../../data/repositories/ml/ml_models.dart';
import '../../data/repositories/ml/ml_repository.dart';
import '../../l10n/app_localizations.dart';

class TagFocusCard extends StatefulWidget {
  const TagFocusCard({super.key, required this.repository});

  final MlRepository repository;

  @override
  State<TagFocusCard> createState() => _TagFocusCardState();
}

class _TagFocusCardState extends State<TagFocusCard> {
  Future<TagFocusResult?>? _future;

  @override
  void initState() {
    super.initState();
    _future = widget.repository.tagFocusOrNull();
  }

  void reload() {
    setState(() {
      _future = widget.repository.tagFocusOrNull();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<TagFocusResult?>(
      future: _future,
      builder: (context, snap) {
        final result = snap.data;
        if (result == null) return const SizedBox.shrink();
        // Rien de pertinent : pas de suggestion → pas de carte.
        if (result.focus.isEmpty && result.relax.isEmpty) {
          return const SizedBox.shrink();
        }
        final scheme = Theme.of(context).colorScheme;
        final l10n = AppLocalizations.of(context);
        return Card(
          elevation: 0,
          color: scheme.surfaceContainerHighest,
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.track_changes,
                        size: 20, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        l10n.mlTagFocusTitle(result.windowDays),
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
                if (result.focus.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(l10n.mlTagRework,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: scheme.error)),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final s in result.focus)
                        _TagChip(suggestion: s, isFocus: true),
                    ],
                  ),
                ],
                if (result.relax.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(l10n.mlTagMastered,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.green.shade700)),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final s in result.relax)
                        _TagChip(suggestion: s, isFocus: false),
                    ],
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.suggestion, required this.isFocus});

  final TagSuggestion suggestion;
  final bool isFocus;

  @override
  Widget build(BuildContext context) {
    final color =
        isFocus ? Theme.of(context).colorScheme.error : Colors.green.shade700;
    final pct = (suggestion.lapseRate * 100).round();
    return Tooltip(
      message: '${suggestion.reason}\n'
          '${AppLocalizations.of(context).mlTagLapses(suggestion.lapses, suggestion.reviews)}',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: color.withOpacity(0.10),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.35)),
        ),
        child: Text(
          '${suggestion.tag} · $pct%',
          style: TextStyle(
              fontSize: 12, color: color, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
