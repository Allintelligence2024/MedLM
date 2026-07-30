// Tests Phase 8 — RestSyncRepository (mock de l'ApiClient).
//
// On vérifie :
//   * pushPending lit le journal local, appelle l'API, marque synced ;
//   * pullSince insère les events distants en append-only (doublons
//     tolérés via catch silencieux) ;
//   * le contrat est respecté : on n'envoie JAMAIS un event déjà synced.
library;

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/srs/review_event.dart';
import 'package:medanki_dz/core/srs/srs_models.dart';
import 'package:medanki_dz/data/local/app_database.dart';
import 'package:medanki_dz/data/network/api_client.dart';
import 'package:medanki_dz/data/repositories/rest_sync_repository.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient({this.pushResponse, this.pullResponse})
      : super(baseUrl: 'http://test', tokenStorage: _NoopStorage());

  final Map<String, dynamic>? pushResponse;
  final Map<String, dynamic>? pullResponse;
  int pushCalls = 0;
  int pullCalls = 0;
  List<ReviewEvent>? lastPushed;

  @override
  Future<Map<String, dynamic>> pushSyncEvents(
    String userId,
    List<ReviewEvent> events,
  ) async {
    pushCalls++;
    lastPushed = events;
    return pushResponse ?? <String, dynamic>{'accepted': [], 'rejected': []};
  }

  @override
  Future<Map<String, dynamic>> pullSyncEvents(
    String userId, {
    required int sinceMs,
    int limit = 200,
  }) async {
    pullCalls++;
    return pullResponse ??
        <String, dynamic>{'events': <dynamic>[], 'next_cursor_ms': sinceMs};
  }
}

// Storage no-op pour le fake.
class _NoopStorage implements dynamic {
  @override
  noSuchMethod(Invocation invocation) async => null;
}

void main() {
  late AppDatabase db;
  late FakeApiClient api;
  late RestSyncRepository repo;

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    api = FakeApiClient();
    repo = RestSyncRepository(api: api, db: db);
    await db.into(db.deckMeta).insert(DeckMetaCompanion.insert(
          deckId: 'd1',
          moduleId: 'm1',
          nameFr: 'Deck 1',
          updatedAt: 1700000000000,
        ));
    await db.into(db.localCards).insert(LocalCardsCompanion.insert(
          id: 'c1',
          deckId: 'd1',
          type: 'basic',
          contentJson: '{}',
          downloadedAt: 1700000000000,
        ));
    await db.into(db.srsState).insert(SrsStateCompanion.insert(
          userId: 'u1',
          cardId: 'c1',
          updatedAt: 1700000000000,
        ));
  });

  tearDown(() async => db.close());

  test('pushPending envoie les events non-synchronisés et marque synced',
      () async {
    final api2 = FakeApiClient(pushResponse: {
      'accepted': <String>[],
      'rejected': <String>[],
    });
    final repo2 = RestSyncRepository(api: api2, db: db);

    await db.into(db.reviewLog).insert(ReviewLogCompanion.insert(
          id: 'e1',
          userId: 'u1',
          cardId: 'c1',
          deviceId: 'd1',
          rating: 3,
          cardType: 'basic',
          reviewedAt: 1700000000000,
          receivedAt: 1700000000000,
        ));
    await db.into(db.reviewLog).insert(ReviewLogCompanion.insert(
          id: 'e2',
          userId: 'u1',
          cardId: 'c1',
          deviceId: 'd1',
          rating: 4,
          cardType: 'basic',
          reviewedAt: 1700000001000,
          receivedAt: 1700000001000,
        ));

    await repo2.pushPending(userId: 'u1', deviceId: 'd1');
    expect(api2.pushCalls, 1);
    expect(api2.lastPushed, hasLength(2));
    expect((await db.select(db.reviewLog).get()).every((r) => r.synced), isTrue);
  });

  test('pushPending ne touche pas aux events déjà synced', () async {
    final api2 = FakeApiClient(pushResponse: {
      'accepted': <String>[],
      'rejected': <String>[],
    });
    final repo2 = RestSyncRepository(api: api2, db: db);

    await db.into(db.reviewLog).insert(ReviewLogCompanion.insert(
          id: 'e1',
          userId: 'u1',
          cardId: 'c1',
          deviceId: 'd1',
          rating: 3,
          cardType: 'basic',
          reviewedAt: 1700000000000,
          receivedAt: 1700000000000,
          synced: const Value<bool>(true), // déjà sync
        ));

    await repo2.pushPending(userId: 'u1', deviceId: 'd1');
    expect(api2.lastPushed, isEmpty);
  });

  test('pullSince insère les events distants (idempotent)', () async {
    final api2 = FakeApiClient(
      pullResponse: {
        'events': <Map<String, dynamic>>[
          {
            'id': '00000000-0000-7000-8000-000000000001',
            'card_id': 'c1',
            'user_id': 'u1',
            'device_id': 'd2',
            'rating': 3,
            'duration_ms': 100,
            'card_type': 'basic',
            'reviewed_at': 1700000002000,
            'exam_mode': false,
          }
        ],
        'next_cursor_ms': 1700000002000,
      },
    );
    final repo2 = RestSyncRepository(api: api2, db: db);

    await repo2.pullSince(userId: 'u1', deviceId: 'd1', sinceMs: 0);
    final rows = await db.select(db.reviewLog).get();
    expect(rows, hasLength(1));
    expect(rows.first.deviceId, 'd2');

    // Re-pull avec le même id : doit être ignoré (doublon silencieux).
    await repo2.pullSince(userId: 'u1', deviceId: 'd1', sinceMs: 0);
    final rows2 = await db.select(db.reviewLog).get();
    expect(rows2, hasLength(1), reason: 'doublon absorbé');
  });
}
