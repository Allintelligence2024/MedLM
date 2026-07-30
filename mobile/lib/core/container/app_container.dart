/// Composition root — câblage des implémentations à leurs interfaces.
///
/// C'est l'**unique** endroit du code applicatif qui connaît à la fois les
/// contrats du domaine ET les implémentations de la couche data. Le reste
/// de l'app ne dépend que des contrats — c'est ce qui rend les use cases
/// testables en isolation et l'architecture remplaçable.
///
/// Pourquoi pas Riverpod dès la Phase 4 ?
///   * Le doc v2 §3 prévoit Riverpod pour la couche présentation, pas pour
///     le câblage bas niveau. Riverpod viendra avec les ViewModels (Phase 8).
///   * En attendant, ce container expose une **API simple** (un objet
///     avec des champs) que les ViewModels et les tests peuvent consommer
///     sans framework.
///   * Le container est immuable : une fois construit, l'app peut le passer
///     partout. Pas de cycles de vie compliqués, pas de singletons globaux.
///
/// Pour les tests : on peut construire un `AppContainer` ad hoc avec un
/// `AppDatabase` mémoire et des fakes pour le sync. Voir
/// `test/domain/use_cases_test.dart` (à venir).
library;

import '../../data/local/app_database.dart';
import '../../data/repositories/card_repository.dart';
import '../../data/repositories/entitlement_repository.dart';
import '../../data/repositories/srs_repository.dart';
import '../../data/repositories/sync_repository.dart';
import '../../domain/domain.dart';

class AppContainer {
  AppContainer({
    required this.database,
    ISyncRepository? syncRepository,
  })  : srsRepository = SrsRepository(database),
        cardRepository = CardRepository(database),
        entitlementRepository = EntitlementRepository(database),
        syncRepository = syncRepository ?? LocalSyncRepository(database);

  final AppDatabase database;
  final ISrsRepository srsRepository;
  final ICardRepository cardRepository;
  final IEntitlementRepository entitlementRepository;
  final ISyncRepository syncRepository;

  // ── Use cases : construits paresseusement, mis en cache ─────────────────
  late final BuildStudyQueueUseCase buildStudyQueue =
      BuildStudyQueueUseCase(srsRepository);
  late final RecordReviewUseCase recordReview =
      RecordReviewUseCase(srsRepository);
  late final FetchDueCardsUseCase fetchDueCards =
      FetchDueCardsUseCase(srsRepository);
  late final SyncOutboxUseCase syncOutbox =
      SyncOutboxUseCase(srsRepository, syncRepository);
  late final ValidateEntitlementUseCase validateEntitlement =
      ValidateEntitlementUseCase(entitlementRepository);
  late final StartMockExamUseCase startMockExam =
      StartMockExamUseCase(srsRepository);
  late final SubmitReportUseCase submitReport =
      SubmitReportUseCase(cardRepository);
  late final DownloadDeckUseCase downloadDeck =
      DownloadDeckUseCase(cardRepository);
}
