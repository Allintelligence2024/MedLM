/// Construit la file d'étude pour la session courante.
///
/// Règle non négociable (doc v2 §4 et §14) :
///   * les revues **dues** passent **avant** les nouvelles cartes ;
///   * le plafond `maxReviewsPerSession` (défaut 100) est un garde-fou
///     anti-burnout — au-delà, la session s'arrête ;
///   * le nombre de nouvelles cartes par jour (5/10/20) est configurable.
///
/// Ce cas d'utilisation est **pur** : il ne mute rien, ne touche pas au
/// réseau, n'orchestre aucune transaction. C'est l'implémentation
/// (Drift) qui garantit l'atomicité des écritures.
library;

import '../entities/entities.dart';
import '../repositories/repositories.dart';

class BuildStudyQueueUseCase {
  const BuildStudyQueueUseCase(this._srs);

  final ISrsRepository _srs;

  Future<List<StudyQueueItem>> call({
    required String userId,
    required int nowMs,
    required String dayKey,
    String? deckId,
    int newCardsPerDay = 10,
    int maxReviewsPerSession = 100,
  }) {
    return _srs.buildStudyQueue(
      userId: userId,
      nowMs: nowMs,
      dayKey: dayKey,
      deckId: deckId,
      newCardsPerDay: newCardsPerDay,
      maxReviewsPerSession: maxReviewsPerSession,
    );
  }
}
