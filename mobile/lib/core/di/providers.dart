/// Composition root Riverpod (audit P1-5).
///
/// Avant ce lot, le projet avait **deux** systèmes de DI concurrents :
/// `flutter_riverpod` déclaré en dépendance de production… et jamais
/// importé nulle part, et un conteneur maison `AppContainer` qui faisait
/// tout le travail. L'audit demandait de trancher — c'est fait : Riverpod
/// devient la DI de l'application, `AppContainer` reste comme *graphe
/// d'objets* pur (aucun Flutter, aucune globale) parce que les tests
/// existants et le worker de fond WorkManager l'utilisent déjà et qu'il
/// est correct.
///
/// Autrement dit : Riverpod fournit le **cycle de vie et la portée**,
/// AppContainer fournit le **câblage**. Un seul chemin, pas deux.
///
/// Les providers marqués « override obligatoire » sont déclarés avec
/// `throw UnimplementedError()` : oublier de les surcharger dans
/// `main()` est alors une erreur immédiate et lisible, plutôt qu'un
/// `null` qui se propage.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/local/app_database.dart';
import '../../data/network/api_client.dart';
import '../../data/network/secure_token_storage.dart';
import '../../data/repositories/ai/ai_repository.dart';
import '../../data/repositories/gamification_repository.dart';
import '../../data/repositories/gateway/graphql_gateway_repository.dart';
import '../../data/repositories/leaderboard/leaderboard_repository.dart';
import '../../data/repositories/ml/ml_repository.dart';
import '../../data/repositories/stats/stats_repository.dart';
import '../../domain/domain.dart';
import '../config/app_config.dart';
import '../container/app_container.dart';
import '../notifications/push_notifications.dart';
import '../session/session_controller.dart';
import '../settings/app_settings.dart';

// ── Racines (surchargées dans main()) ──────────────────────────────────

/// Configuration de build. Override obligatoire.
final appConfigProvider = Provider<AppConfig>((ref) {
  throw UnimplementedError('appConfigProvider doit être surchargé dans main()');
});

/// Base locale Drift ouverte sur le fichier de l'application.
/// Override obligatoire (l'ouverture est asynchrone, faite au boot).
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  throw UnimplementedError('appDatabaseProvider doit être surchargé dans main()');
});

/// Version applicative (package_info_plus). Override obligatoire.
final appVersionProvider = Provider<String>((ref) {
  throw UnimplementedError('appVersionProvider doit être surchargé dans main()');
});

// ── Graphe d'objets ────────────────────────────────────────────────────

/// Le conteneur de câblage. Une seule instance par application : c'est
/// lui qui détient l'ApiClient (donc les intercepteurs et le refresh
/// token), il ne doit surtout pas être reconstruit à chaque rebuild.
final appContainerProvider = Provider<AppContainer>((ref) {
  final container = AppContainer(
    database: ref.watch(appDatabaseProvider),
    apiBaseUrl: ref.watch(appConfigProvider).apiBaseUrl,
  );
  return container;
});

final tokenStorageProvider = Provider<SecureTokenStorage>(
  (ref) => ref.watch(appContainerProvider).tokenStorage,
);

final apiClientProvider = Provider<ApiClient>(
  (ref) => ref.watch(appContainerProvider).apiClient,
);

// ── Repositories ───────────────────────────────────────────────────────

final srsRepositoryProvider = Provider<ISrsRepository>(
  (ref) => ref.watch(appContainerProvider).srsRepository,
);

final cardRepositoryProvider = Provider<ICardRepository>(
  (ref) => ref.watch(appContainerProvider).cardRepository,
);

final syncRepositoryProvider = Provider<ISyncRepository>(
  (ref) => ref.watch(appContainerProvider).syncRepository,
);

final entitlementRepositoryProvider = Provider<IEntitlementRepository>(
  (ref) => ref.watch(appContainerProvider).entitlementRepository,
);

final aiRepositoryProvider = Provider<AiRepository>(
  (ref) => ref.watch(appContainerProvider).aiRepository,
);

final mlRepositoryProvider = Provider<MlRepository>(
  (ref) => ref.watch(appContainerProvider).mlRepository,
);

final graphqlGatewayProvider = Provider<GraphqlGatewayRepository>(
  (ref) => ref.watch(appContainerProvider).graphqlGateway,
);

final statsRepositoryProvider = Provider<StatsRepository>(
  (ref) => StatsRepository(api: ref.watch(apiClientProvider)),
);

final leaderboardRepositoryProvider = Provider<LeaderboardRepository>(
  (ref) => LeaderboardRepository(api: ref.watch(apiClientProvider)),
);

final gamificationRepositoryProvider = Provider<GamificationRepository>(
  (ref) => GamificationRepository(ref.watch(appDatabaseProvider)),
);

// ── Use cases ──────────────────────────────────────────────────────────

final buildStudyQueueProvider = Provider<BuildStudyQueueUseCase>(
  (ref) => ref.watch(appContainerProvider).buildStudyQueue,
);

final recordReviewProvider = Provider<RecordReviewUseCase>(
  (ref) => ref.watch(appContainerProvider).recordReview,
);

final syncOutboxProvider = Provider<SyncOutboxUseCase>(
  (ref) => ref.watch(appContainerProvider).syncOutbox,
);

final downloadDeckProvider = Provider<DownloadDeckUseCase>(
  (ref) => ref.watch(appContainerProvider).downloadDeck,
);

final validateEntitlementProvider = Provider<ValidateEntitlementUseCase>(
  (ref) => ref.watch(appContainerProvider).validateEntitlement,
);

// ── État applicatif ────────────────────────────────────────────────────

/// Session : qui est connecté, et avec quels jetons.
final sessionProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);

/// Préférences locales (langue, objectif quotidien, rappels).
final settingsProvider =
    AsyncNotifierProvider<AppSettingsController, AppSettings>(
  AppSettingsController.new,
);

/// Service de notifications push (FCM) — audit P1-3.
final pushNotificationsProvider = Provider<PushNotificationsService>((ref) {
  final service = PushNotificationsService(
    api: ref.watch(apiClientProvider),
  );
  ref.onDispose(service.dispose);
  return service;
});

/// Nombre de cartes dues — rafraîchi à chaque invalidation explicite
/// (fin de session d'étude, sync terminée).
final dueCountProvider = FutureProvider<int>((ref) async {
  final session = ref.watch(sessionProvider);
  final userId = session.userId;
  if (userId == null) return 0;
  final srs = ref.watch(srsRepositoryProvider);
  return srs.dueCount(userId, DateTime.now().millisecondsSinceEpoch);
});

/// Petit utilitaire de debug : liste des overrides manquants.
@visibleForTesting
const requiredOverrides = <String>[
  'appConfigProvider',
  'appDatabaseProvider',
  'appVersionProvider',
];
