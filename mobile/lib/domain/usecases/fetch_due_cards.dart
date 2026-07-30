/// Récupère la liste des cartes dues, pour le tableau de bord.
///
/// Plus économe que `BuildStudyQueueUseCase` : ne lit que l'index
/// `srs_state(user_id, due_ms)`, sans toucher au contenu des cartes.
library;

import '../repositories/repositories.dart';

class FetchDueCardsUseCase {
  const FetchDueCardsUseCase(this._srs);

  final ISrsRepository _srs;

  Future<int> call({required String userId, required int nowMs}) {
    return _srs.dueCount(userId, nowMs);
  }
}
