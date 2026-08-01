// HintBanner — bannière d'indice adaptatif pendant l'étude (Phase 19.5).
//
// Branchée sur GET /v1/ai/hints/:cardId (Phase 18.1 — règles SRS,
// SANS appel LLM). Règles de comportement :
//   * le hint est une AIDE, pas un prérequis : offline/quota/erreur →
//     la bannière disparaît silencieusement, l'étude continue ;
//   * le résultat est caché par carte + langue (AiRepository) : afficher
//     la réponse puis revenir à la question ne déclenche pas de nouvel
//     appel ;
//   * explicable (v2 §13) : un expansion tile expose `based_on`
//     (les signaux ayant motivé le hint).
library;

import 'package:flutter/material.dart';

import '../../data/repositories/ai/ai_models.dart';
import '../../data/repositories/ai/ai_repository.dart';

class HintBanner extends StatefulWidget {
  const HintBanner({
    super.key,
    required this.repository,
    required this.cardId,
    this.lang,
  });

  final AiRepository repository;
  final String cardId;
  final AiLang? lang;

  @override
  State<HintBanner> createState() => _HintBannerState();
}

class _HintBannerState extends State<HintBanner> {
  Future<AiHint?>? _future;
  bool _dismissed = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void didUpdateWidget(covariant HintBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.cardId != widget.cardId || oldWidget.lang != widget.lang) {
      _dismissed = false;
      _future = _load();
    }
  }

  /// hintOrNull : jamais d'exception en UI d'étude.
  Future<AiHint?> _load() =>
      widget.repository.hintOrNull(widget.cardId, lang: widget.lang);

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();
    return FutureBuilder<AiHint?>(
      future: _future,
      builder: (context, snap) {
        final hint = snap.data;
        // Chargement, erreur ou offline : rien à montrer — la session
        // d'étude n'est jamais bloquée par le hint.
        if (hint == null) return const SizedBox.shrink();
        final scheme = Theme.of(context).colorScheme;
        return Semantics(
          label: 'Indice personnalisé',
          child: Card(
            elevation: 0,
            color: scheme.tertiaryContainer,
            margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.lightbulb_outline,
                          size: 20, color: scheme.onTertiaryContainer),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          hint.text,
                          style: TextStyle(
                            color: scheme.onTertiaryContainer,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        tooltip: 'Masquer l\u2019indice',
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () => setState(() => _dismissed = true),
                      ),
                    ],
                  ),
                  if (hint.basedOn.isNotEmpty)
                    Theme(
                      data: Theme.of(context)
                          .copyWith(dividerColor: Colors.transparent),
                      child: ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        childrenPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(
                          'Pourquoi cet indice ?',
                          style: TextStyle(
                            fontSize: 12,
                            color: scheme.onTertiaryContainer
                                .withOpacity(0.75),
                          ),
                        ),
                        children: [
                          for (final reason in hint.basedOn)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                '• $reason',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: scheme.onTertiaryContainer
                                      .withOpacity(0.75),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
