// StatsRepository — consomme /v1/stats/me (Phase 15.2).
library;

import '../../network/api_client.dart';
import 'stats_models.dart';

class StatsRepository {
  StatsRepository({required this.api});
  final ApiClient api;

  /// Récupère les stats pour l'utilisateur courant. `period` est
  /// l'un des 'day' / 'week' / 'month' / 'all'.
  Future<UserStats> fetchMe({String period = 'all'}) async {
    final raw = await api.fetchStats(period: period);
    return UserStats.fromJson(raw);
  }
}
