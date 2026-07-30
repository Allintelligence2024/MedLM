// LeaderboardRepository — consomme l'API backend (Phase 9 bis).
//
// Endpoints utilisés :
//   * GET    /v1/gamification/leaderboard        → Snapshot
//   * GET    /v1/gamification/leaderboard/me     → état d'opt-in
//   * POST   /v1/gamification/leaderboard/opt-in → opt-in
//   * DELETE /v1/gamification/leaderboard/opt-in → opt-out (RGPD)
//
// Conformité v2 §9.5 : pseudonyme obligatoire, scope hebdo,
// filtres faculté/année.
library;

import '../../../data/network/api_client.dart';
import 'leaderboard_models.dart';

class LeaderboardRepository {
  LeaderboardRepository({required this.api});
  final ApiClient api;

  Future<LeaderboardSnapshot> fetchTop({
    String? faculty,
    int? studyYear,
    int limit = 50,
  }) async {
    final queryParams = <String, dynamic>{'limit': limit};
    if (faculty != null) queryParams['faculty'] = faculty;
    if (studyYear != null) queryParams['study_year'] = studyYear;
    final raw = await api.leaderboardTop(faculty: faculty, studyYear: studyYear, limit: limit);
    return LeaderboardSnapshot.fromJson(raw);
  }

  Future<bool> isOptIn() async {
    final raw = await api.leaderboardMe();
    return raw['opt_in'] as bool;
  }

  Future<void> optIn({
    required String pseudonym,
    String? faculty,
    int? studyYear,
  }) async {
    await api.leaderboardOptIn(
      pseudonym: pseudonym,
      faculty: faculty,
      studyYear: studyYear,
    );
  }

  Future<void> optOut() async {
    await api.leaderboardOptOut();
  }
}
