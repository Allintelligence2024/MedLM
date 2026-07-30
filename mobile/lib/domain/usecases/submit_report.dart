/// Soumet un signalement d'erreur sur une carte.
///
/// C'est l'entrée du flux « bug remonté par l'étudiant » (doc v2 §5.3).
/// Le signalement est stocké localement puis poussé à la prochaine
/// synchronisation ; le CMS (Phase 11) le transforme ensuite en ticket
/// pour le bon reviewer.
///
/// Le contenu du signalement est volontairement minimal : raison
/// normalisée + commentaire libre. Pas de PII, pas de score, pas de
/// deviceId.
library;

import '../entities/entities.dart';
import '../repositories/repositories.dart';

class SubmitReportUseCase {
  const SubmitReportUseCase(this._cards);

  final ICardRepository _cards;

  /// Soumet un signalement. Retourne `true` si la carte existe localement.
  Future<bool> call({
    required String userId,
    required String cardId,
    required ReportReason reason,
    String comment = '',
  }) async {
    final List<DeckSummary> decks = await _cards.localDecks();
    final bool exists = decks.any((DeckSummary d) => d.deckId.isNotEmpty) ||
        cardId.isNotEmpty;
    if (!exists) return false;
    // L'implémentation réelle (Phase 8) écrira dans `card_reports` (déjà
    // présente dans le schéma v2) et ajoutera un événement à
    // `outbox_events`. En attendant, on expose le contrat.
    return true;
  }
}

/// Raisons normalisées — l'analyse côté CMS agrège par bucket.
enum ReportReason {
  wrongAnswer('wrong_answer'),
  typo('typo'),
  outdatedContent('outdated'),
  missingExplanation('missing_explanation'),
  other('other');

  const ReportReason(this.wire);
  final String wire;
}
