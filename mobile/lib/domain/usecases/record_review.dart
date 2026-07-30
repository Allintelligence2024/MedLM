/// Enregistre une revue et déclenche toutes les écritures atomiques
/// associées (journal immuable, file de sortie, projection d'état).
///
/// Ce use case est l'unique porte d'entrée pour modifier la progression
/// d'un étudiant. Toute la phase 1-3 (FSRS-5 réel, journal append-only
/// protégé par la base, déduplication par id UUID v7) est encapsulée
/// derrière cette fonction.
library;

import '../entities/entities.dart';
import '../repositories/repositories.dart';

class RecordReviewUseCase {
  const RecordReviewUseCase(this._srs);

  final ISrsRepository _srs;

  Future<SrsCardState> call({
    required String userId,
    required String cardId,
    required String deviceId,
    required Rating rating,
    required int nowMs,
    required String dayKey,
    CardType cardType = CardType.basic,
    int durationMs = 0,
    bool examMode = false,
  }) {
    return _srs.recordReview(
      userId: userId,
      cardId: cardId,
      deviceId: deviceId,
      rating: rating,
      nowMs: nowMs,
      dayKey: dayKey,
      cardType: cardType,
      durationMs: durationMs,
      examMode: examMode,
    );
  }
}
