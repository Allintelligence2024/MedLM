/// Télécharge un deck (métadonnées + cartes + médias) pour usage hors ligne.
///
/// Implémentation réelle : Phase 8 (téléchargement HTTP avec progression,
/// chiffrement AES-256-GCM pour les decks premium, stockage R2). Ce use
/// case définit le **contrat** pour que les ViewModels ne dépendent pas du
/// réseau.
///
/// Choix produit : le téléchargement est **explicite**. Il n'est jamais
/// déclenché à l'ouverture de l'app (coût réseau DZ, forfait étudiant).
/// L'étudiant va dans « Decks », sélectionne, et lance.
library;

import '../repositories/repositories.dart';

enum DownloadOutcome { started, alreadyDownloaded, failed }

class DownloadDeckUseCase {
  const DownloadDeckUseCase(this._cards);

  final ICardRepository _cards;

  /// Lance le téléchargement d'un deck. Version Phase 4 : on vérifie
  /// seulement que le deck est connu localement et on l'enregistre comme
  /// « téléchargé ». Le transport HTTP viendra avec la Phase 8.
  Future<DownloadOutcome> call({
    required String deckId,
    required int version,
    required int cardCount,
    required bool isPremium,
  }) async {
    final List<DeckSummary> known = await _cards.localDecks();
    if (known.any((DeckSummary d) =>
        d.deckId == deckId && d.version == version)) {
      return DownloadOutcome.alreadyDownloaded;
    }
    await _cards.recordDeckDownload(
      deckId: deckId,
      version: version,
      cardCount: cardCount,
      isPremium: isPremium,
    );
    return DownloadOutcome.started;
  }
}
