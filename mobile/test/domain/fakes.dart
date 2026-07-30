/// Fakes pour les tests de la couche domaine.
///
/// Chaque fake implémente l'interface du domaine avec un comportement
/// déterministe et observable. Ils sont volontairement minimaux : on veut
/// vérifier que le use case **délègue correctement**, pas re-tester le
/// repository (ça, c'est dans `test/data/`).
library;

import 'package:medanki_dz/core/srs/srs_models.dart';
import 'package:medanki_dz/domain/domain.dart';

/// Fake de `ISrsRepository` : file d'attente en mémoire, journal non
/// persistant. Permet de tester les use cases sans base de données.
class FakeSrsRepository implements ISrsRepository {
  final List<StudyQueueItem> queue = <StudyQueueItem>[];
  final List<String> rebuiltFor = <String>[];

  @override
  Future<SrsCardState> stateFor(String userId, String cardId) async =>
      SrsCardState.initial;

  @override
  Future<List<StudyQueueItem>> buildStudyQueue({
    required String userId,
    required int nowMs,
    required String dayKey,
    String? deckId,
    int newCardsPerDay = 10,
    int maxReviewsPerSession = 100,
  }) async {
    return queue.take(maxReviewsPerSession).toList();
  }

  @override
  Future<SrsCardState> recordReview({
    required String userId,
    required String cardId,
    required String deviceId,
    required Rating rating,
    required int nowMs,
    required String dayKey,
    CardType cardType = CardType.basic,
    int durationMs = 0,
    bool examMode = false,
  }) async {
    return SrsCardState.initial.copyWith(reps: 1);
  }

  @override
  Future<SrsCardState> rebuildFromLog({
    required String userId,
    required String cardId,
    required int nowMs,
  }) async {
    rebuiltFor.add(cardId);
    return SrsCardState.initial;
  }

  @override
  Future<int> dueCount(String userId, int nowMs) async => 0;

  @override
  Future<List<ReviewEvent>> pendingForPush(String userId,
      {int limit = 100}) async {
    return <ReviewEvent>[];
  }

  @override
  Future<void> markSynced(List<String> eventIds) async {}

  @override
  Future<void> bury({
    required String userId,
    required String cardId,
    required int untilMs,
  }) async {}
}

/// Fake de `ISyncRepository` : permet de programmer une liste d'événements
/// distants à "pull" et de vérifier ce qui est pushé.
class FakeSyncRepository implements ISyncRepository {
  final List<ReviewEvent> pullEvents = <ReviewEvent>[];
  final List<List<String>> pushRequests = <List<String>>[];

  @override
  Future<SyncPushOutcome> pushPending({
    required String userId,
    required String deviceId,
    int maxBatch = 100,
  }) async {
    return const SyncPushOutcome(acceptedIds: <String>[]);
  }

  @override
  Future<SyncPullOutcome> pullSince({
    required String userId,
    required String deviceId,
    required int sinceMs,
  }) async {
    return SyncPullOutcome(
      events: List<ReviewEvent>.of(pullEvents),
      nextCursorMs: pullEvents.isNotEmpty
          ? pullEvents.last.reviewedAtMs
          : sinceMs,
    );
  }

  @override
  Future<void> markAllSynced(
      String userId, Iterable<String> eventIds) async {}
}

/// Fake de `IEntitlementRepository` : état programmable.
class FakeEntitlementRepository implements IEntitlementRepository {
  FakeEntitlementRepository(this._state);
  EntitlementState _state;

  @override
  Future<EntitlementState> current() async => _state;

  @override
  Future<void> storeToken({
    required String userId,
    required String signedToken,
    required int expiresAtMs,
    int? graceUntilMs,
  }) async {
    _state = EntitlementState(
      plan: EntitlementPlan.premium,
      isValid: true,
      expiresAtMs: expiresAtMs,
      graceUntilMs: graceUntilMs,
    );
  }
}

/// Fake de `ICardRepository` : permet de pré-remplir les decks connus.
class FakeCardRepository implements ICardRepository {
  final List<DeckSummary> existing = <DeckSummary>[];

  @override
  Future<LoadDeckResult> loadDeck(String deckId) async => LoadDeckResult(
        deckId: deckId,
        cards: const <LoadedCard>[],
        rejectedCardIds: const <String>[],
      );

  @override
  Future<List<DeckSummary>> localDecks({bool includePremiumOnly = false}) async {
    return List<DeckSummary>.of(existing);
  }

  @override
  Future<void> recordDeckDownload({
    required String deckId,
    required int version,
    required int cardCount,
    required bool isPremium,
  }) async {
    existing.add(DeckSummary(
      deckId: deckId,
      moduleId: 'm',
      nameFr: deckId,
      version: version,
      cardCount: cardCount,
      isPremium: isPremium,
      isOfflineReady: true,
    ));
  }
}
