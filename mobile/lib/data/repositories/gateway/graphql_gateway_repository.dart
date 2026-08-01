// GraphqlGatewayRepository — consomme le gateway GraphQL v2 (Phase 20.2).
//
// 5 opérations persistées lecture seule (SDL exactes dans
// graphql_operations.dart, verrouillées par check_graphql.py) :
//
//   * viewerStats       — stats utilisateur (coût 10) ;
//   * deckCatalog       — catalogue des decks (coût 5) ;
//   * adaptiveProfile   — profil adaptatif explicable (coût 15) ;
//   * mockExamTemplates — templates d'examens blancs (coût 8) ;
//   * leaderboardTop    — classement hebdo (coût 6).
//
// Quand choisir le gateway plutôt que REST ? Restez sur REST pour le
// flux principal (sync SRS). Le gateway sert aux écrans composés
// (dashboard) et aux clients tiers — les variantes *OrNull masquent
// proprement le cas GRAPHQL_ENABLED=OFF (503) et le budget 429.
library;

import '../../network/api_client.dart';
import 'graphql_models.dart';
import 'graphql_operations.dart';

class GraphqlGatewayRepository {
  GraphqlGatewayRepository({required this.api});

  final ApiClient api;

  /// Stats de l'utilisateur courant. [period] ∈ day/week/month/all
  /// (défaut serveur : all).
  Future<GqlViewerStats> viewerStats({String period = 'all'}) async {
    final data = await api.graphql(
      GraphqlOperations.viewerStats,
      variables: {'period': period},
    );
    return GqlViewerStats.fromJson(_node(data, 'viewerStats'));
  }

  Future<GqlViewerStats?> viewerStatsOrNull({String period = 'all'}) async {
    try {
      return await viewerStats(period: period);
    } catch (_) {
      return null;
    }
  }

  /// Catalogue des decks (public + premium marqués).
  Future<List<GqlDeckEntry>> deckCatalog() async {
    final data = await api.graphql(GraphqlOperations.deckCatalog);
    return ((data['deckCatalog'] as List?) ?? const [])
        .map((e) => GqlDeckEntry.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<List<GqlDeckEntry>?> deckCatalogOrNull() async {
    try {
      return await deckCatalog();
    } catch (_) {
      return null;
    }
  }

  /// Profil adaptatif (explicabilité seule — les 19 poids sont
  /// l'affaire du moteur local + endpoint REST dédié).
  Future<GqlAdaptiveProfile> adaptiveProfile() async {
    final data = await api.graphql(GraphqlOperations.adaptiveProfile);
    return GqlAdaptiveProfile.fromJson(_node(data, 'adaptiveProfile'));
  }

  Future<GqlAdaptiveProfile?> adaptiveProfileOrNull() async {
    try {
      return await adaptiveProfile();
    } catch (_) {
      return null;
    }
  }

  /// Templates d'examens blancs, filtres optionnels.
  Future<List<GqlExamTemplate>> mockExamTemplates({
    String? faculty,
    int? studyYear,
  }) async {
    final data = await api.graphql(
      GraphqlOperations.mockExamTemplates,
      variables: {
        if (faculty != null) 'faculty': faculty,
        if (studyYear != null) 'studyYear': studyYear,
      },
    );
    return ((data['mockExamTemplates'] as List?) ?? const [])
        .map((e) =>
            GqlExamTemplate.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<List<GqlExamTemplate>?> mockExamTemplatesOrNull({
    String? faculty,
    int? studyYear,
  }) async {
    try {
      return await mockExamTemplates(faculty: faculty, studyYear: studyYear);
    } catch (_) {
      return null;
    }
  }

  /// Classement hebdomadaire (top N, filtres optionnels).
  Future<GqlLeaderboard> leaderboardTop({
    String? faculty,
    int? studyYear,
    int limit = 50,
  }) async {
    final data = await api.graphql(
      GraphqlOperations.leaderboardTop,
      variables: {
        if (faculty != null) 'faculty': faculty,
        if (studyYear != null) 'studyYear': studyYear,
        'limit': limit,
      },
    );
    return GqlLeaderboard.fromJson(_node(data, 'leaderboardTop'));
  }

  Future<GqlLeaderboard?> leaderboardTopOrNull({
    String? faculty,
    int? studyYear,
    int limit = 50,
  }) async {
    try {
      return await leaderboardTop(
        faculty: faculty,
        studyYear: studyYear,
        limit: limit,
      );
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic> _node(Map<String, dynamic> data, String key) {
    return Map<String, dynamic>.from((data[key] as Map?) ?? const {});
  }
}
