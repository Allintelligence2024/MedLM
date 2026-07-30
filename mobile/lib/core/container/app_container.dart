// AppContainer — composition root (Phase 8 : on branche la couche réseau).
import '../../data/local/app_database.dart';
import '../../data/network/api_client.dart';
import '../../data/network/secure_token_storage.dart';
import '../../data/repositories/card_repository.dart';
import '../../data/repositories/entitlement_repository.dart';
import '../../data/repositories/rest_entitlement_repository.dart';
import '../../data/repositories/rest_sync_repository.dart';
import '../../data/repositories/srs_repository.dart';
import '../../data/repositories/sync_repository.dart';
import '../../domain/domain.dart';

class AppContainer {
  AppContainer({
    required this.database,
    required this.apiBaseUrl,
    ISyncRepository? syncRepository,
    IEntitlementRepository? entitlementRepository,
  })  : tokenStorage = SecureTokenStorage(),
        apiClient = ApiClient(
          baseUrl: apiBaseUrl,
          tokenStorage: tokenStorage,
        ) {
    // Si un repo custom n'est pas passé, on prend l'impl REST par défaut.
    this.syncRepository = syncRepository ??
        RestSyncRepository(api: apiClient, db: database);
    this.entitlementRepository = entitlementRepository ??
        RestEntitlementRepository(api: apiClient, storage: tokenStorage);
    _initLegacyRefs();
  }

  final AppDatabase database;
  final String apiBaseUrl;
  final SecureTokenStorage tokenStorage;
  final ApiClient apiClient;

  // Use cases (instanciés paresseusement).
  late final BuildStudyQueueUseCase buildStudyQueue =
      BuildStudyQueueUseCase(srsRepository);
  late final RecordReviewUseCase recordReview = RecordReviewUseCase(srsRepository);
  late final FetchDueCardsUseCase fetchDueCards = FetchDueCardsUseCase(srsRepository);
  late final SyncOutboxUseCase syncOutbox =
      SyncOutboxUseCase(srsRepository, syncRepository);
  late final ValidateEntitlementUseCase validateEntitlement =
      ValidateEntitlementUseCase(entitlementRepository);
  late final StartMockExamUseCase startMockExam =
      StartMockExamUseCase(srsRepository);
  late final SubmitReportUseCase submitReport = SubmitReportUseCase(cardRepository);
  late final DownloadDeckUseCase downloadDeck = DownloadDeckUseCase(cardRepository);

  // Refs historiques (les tests existants les utilisent directement).
  late final SrsRepository srsRepository;
  late final CardRepository cardRepository;
  late final IEntitlementRepository entitlementRepository;
  late final ISyncRepository syncRepository;

  void _initLegacyRefs() {
    srsRepository = SrsRepository(database);
    cardRepository = CardRepository(database);
  }
}
