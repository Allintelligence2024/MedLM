// Tests Phase 20.2 — gateway GraphQL côté mobile.
//
// On vérifie :
//   * les 5 opérations partent avec leur SDL persistée EXACTE (copie
//     de l'allow-list serveur — la parité est verrouillée repo-wide
//     par tools/scripts/check_graphql.py) ;
//   * le mapping enveloppe {data:{…}} → modèles typés ;
//   * les variantes *OrNull masquent 400/429/503 sans jamais lancer.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/data/network/api_client.dart';
import 'package:medanki_dz/data/network/api_exceptions.dart';
import 'package:medanki_dz/data/repositories/gateway/graphql_gateway_repository.dart';
import 'package:medanki_dz/data/repositories/gateway/graphql_operations.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient({this.fail = false})
      : super(baseUrl: 'http://test', tokenStorage: _NoopStorage());

  final bool fail;
  final List<String> queriesSent = [];
  Map<String, dynamic>? lastVariables;

  @override
  Future<Map<String, dynamic>> graphql(
    String query, {
    Map<String, dynamic>? variables,
  }) async {
    queriesSent.add(query);
    lastVariables = variables;
    if (fail) throw const ServerException('503 GRAPHQL_ENABLED off');
    if (query == GraphqlOperations.viewerStats) {
      return <String, dynamic>{
        'viewerStats': const {
          'period': 'week',
          'cardsReviewed': 412,
          'accuracy': 0.83,
          'currentStreak': 11,
          'xpTotal': 9200,
          'level': 7,
          'leechCount': 3,
        },
      };
    }
    if (query == GraphqlOperations.deckCatalog) {
      return <String, dynamic>{
        'deckCatalog': const [
          {
            'deckId': 'd1',
            'nameFr': 'Anatomie — Membre supérieur',
            'isPremium': false,
            'updatedAt': '2026-07-20T10:00:00.000Z',
          },
          {
            'deckId': 'd2',
            'nameFr': 'Physiologie — Cardiaque',
            'isPremium': true,
            'updatedAt': '2026-07-25T10:00:00.000Z',
          },
        ],
      };
    }
    if (query == GraphqlOperations.adaptiveProfile) {
      return <String, dynamic>{
        'adaptiveProfile': const {
          'windowDays': 30,
          'totalReviews': 320,
          'lapseRate': 0.31,
          'fsrsAdjustment': {
            'active': true,
            'changedIndices': [11],
            'reasons': ['lapse_rate élevé (31% ≥ 30%) → w11 ×1.15'],
          },
        },
      };
    }
    if (query == GraphqlOperations.mockExamTemplates) {
      return <String, dynamic>{
        'mockExamTemplates': const [
          {'id': 't1', 'title': 'Externat — Cardiologie 2026'},
        ],
      };
    }
    if (query == GraphqlOperations.leaderboardTop) {
      return <String, dynamic>{
        'leaderboardTop': const {
          'week': '2026-W31',
          'entries': [
            {'pseudonym': 'sistema', 'xpTotal': 4800, 'rank': 1},
            {'pseudonym': 'neuron', 'xpTotal': 4200, 'rank': 2},
          ],
        },
      };
    }
    throw StateError('requête inconnue : $query');
  }
}

class _NoopStorage implements dynamic {
  @override
  noSuchMethod(Invocation invocation) async => null;
}

void main() {
  late FakeApiClient api;
  late GraphqlGatewayRepository repo;

  setUp(() {
    api = FakeApiClient();
    repo = GraphqlGatewayRepository(api: api);
  });

  test('viewerStats : SDL exacte + variables + mapping typé', () async {
    final stats = await repo.viewerStats(period: 'week');
    expect(api.queriesSent.single, GraphqlOperations.viewerStats);
    expect(api.lastVariables, {'period': 'week'});
    expect(stats.cardsReviewed, 412);
    expect(stats.accuracy, closeTo(0.83, 1e-9));
    expect(stats.level, 7);
    expect(stats.leechCount, 3);
  });

  test('deckCatalog : liste typée, premium distingué', () async {
    final decks = await repo.deckCatalog();
    expect(api.queriesSent.single, GraphqlOperations.deckCatalog);
    expect(decks, hasLength(2));
    expect(decks.first.deckId, 'd1');
    expect(decks.first.isPremium, isFalse);
    expect(decks.last.isPremium, isTrue);
  });

  test('adaptiveProfile : explicabilité sans les poids (volontaire)',
      () async {
    final profile = await repo.adaptiveProfile();
    expect(api.queriesSent.single, GraphqlOperations.adaptiveProfile);
    expect(profile.adjustmentActive, isTrue);
    expect(profile.changedIndices, [11]);
    expect(profile.reasons.single, contains('w11'));
  });

  test('mockExamTemplates : filtres passés en variables', () async {
    final templates =
        await repo.mockExamTemplates(faculty: 'Oran', studyYear: 3);
    expect(api.lastVariables, {'faculty': 'Oran', 'studyYear': 3});
    expect(templates.single.title, contains('Cardiologie'));
  });

  test('leaderboardTop : limit toujours envoyée (défaut serveur 50)',
      () async {
    final board = await repo.leaderboardTop(limit: 10);
    expect(api.lastVariables, {'limit': 10});
    expect(board.week, '2026-W31');
    expect(board.entries, hasLength(2));
    expect(board.entries.first.rank, 1);
    expect(board.entries.first.pseudonym, 'sistema');
  });

  test('variantes OrNull : 400/429/503 masqués silencieusement', () async {
    final offline = GraphqlGatewayRepository(api: FakeApiClient(fail: true));
    expect(await offline.viewerStatsOrNull(), isNull);
    expect(await offline.deckCatalogOrNull(), isNull);
    expect(await offline.adaptiveProfileOrNull(), isNull);
    expect(await offline.mockExamTemplatesOrNull(), isNull);
    expect(await offline.leaderboardTopOrNull(), isNull);
    // Les variantes strictes, elles, propagent — choix du caller.
    expect(offline.viewerStats, throwsA(isA<ServerException>()));
  });

  test('les 5 SDL declares sont bien 5 opérations distinctes persistées',
      () {
    expect(GraphqlOperations.all, hasLength(5));
    expect(GraphqlOperations.all.toSet(), hasLength(5));
    for (final sdl in GraphqlOperations.all) {
      expect(sdl, startsWith('query '));
    }
  });
}
