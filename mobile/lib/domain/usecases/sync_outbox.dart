/// Synchronise la file de sortie locale avec le serveur.
///
/// L'algorithme suit le protocole défini en Phase 6 :
///   1. PUSH : on tente d'envoyer les événements en attente, par lots de
///      100 maximum. Les doublons d'`id` sont dédupliqués par le serveur
///      (idempotence).
///   2. PULL : on récupère les événements émis par d'autres appareils
///      depuis le dernier curseur.
///   3. REBUILD : on rejoue le journal complet (local + distant) pour
///      chaque carte touchée, via `FsrsEngine.fold`.
///   4. MARK : on marque les événements effectivement poussés.
///
/// Aucune partie de ce use case ne touche à l'interface réseau : c'est
/// l'implémentation de `ISyncRepository` qui décide si elle parle à Dio,
/// à un mock, ou à un transport encore non spécifié.
library;

import '../entities/entities.dart';
import '../repositories/repositories.dart';

class SyncOutboxUseCase {
  const SyncOutboxUseCase(this._srs, this._sync);

  final ISrsRepository _srs;
  final ISyncRepository _sync;

  /// Résultat de la synchronisation, exposé au ViewModel.
  class Outcome {
    const Outcome({
      required this.pushedCount,
      required this.pulledCount,
      required this.rebuiltCards,
    });
    final int pushedCount;
    final int pulledCount;
    final int rebuiltCards;
  }

  Future<Outcome> call({
    required String userId,
    required String deviceId,
    int nowMs = 0,
  }) async {
    // 1. PUSH.
    final SyncPushOutcome push = await _sync.pushPending(
      userId: userId,
      deviceId: deviceId,
    );
    if (push.acceptedIds.isNotEmpty) {
      await _srs.markSynced(push.acceptedIds);
    }

    // 2. PULL — depuis le dernier curseur.
    final SyncPullOutcome pull = await _sync.pullSince(
      userId: userId,
      deviceId: deviceId,
      sinceMs: 0, // Sera remplacé par un curseur persistant en Phase 8.
    );

    // 3. REBUILD — pour chaque carte touchée par un événement distant.
    final Set<String> touchedCardIds = <String>{
      for (final ReviewEvent e in pull.events) e.cardId,
    };
    for (final String cardId in touchedCardIds) {
      await _srs.rebuildFromLog(
        userId: userId,
        cardId: cardId,
        nowMs: nowMs,
      );
    }

    return Outcome(
      pushedCount: push.acceptedIds.length,
      pulledCount: pull.events.length,
      rebuiltCards: touchedCardIds.length,
    );
  }
}
