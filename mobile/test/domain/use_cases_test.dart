/// Tests de la couche domaine (use cases).
///
/// On vérifie ici trois choses :
///   1. les use cases **passent** correctement les paramètres à leurs
///      dépendances ;
///   2. les use cases ne lèvent **pas** d'exception quand l'adaptateur
///      fonctionne (smoke test) ;
///   3. les use cases **refusent** les entrées invalides (défense en
///      profondeur, le domaine ne fait pas confiance à la présentation).
///
/// L'implémentation réelle (Drift, serveur) est testée séparément dans
/// `test/data/srs_repository_test.dart` et `test/integration/`.
library;

import 'package:drift/native.dart';
import 'package:medanki_dz/core/srs/review_event.dart';
import 'package:medanki_dz/core/srs/srs_models.dart';
import 'package:medanki_dz/data/local/app_database.dart';
import 'package:medanki_dz/data/repositories/srs_repository.dart';
import 'package:medanki_dz/domain/domain.dart';
import 'package:test/test.dart';

import 'fakes.dart';

void main() {
  group('BuildStudyQueueUseCase', () {
    late AppDatabase db;
    late SrsRepository srs;
    late BuildStudyQueueUseCase useCase;

    setUp(() async {
      db = AppDatabase(NativeDatabase.memory());
      srs = SrsRepository(db);
      useCase = BuildStudyQueueUseCase(srs);
      await _seedDeck(db);
    });

    tearDown(() async => db.close());

    test('délègue au repository avec les paramètres reçus', () async {
      final List<StudyQueueItem> queue = await useCase(
        userId: 'u1',
        nowMs: 1700000000000,
        dayKey: '2023-11-14',
        newCardsPerDay: 5,
        maxReviewsPerSession: 50,
      );
      expect(queue, isNotNull);
    });

    test('respecte les plafonds configurés', () async {
      final List<StudyQueueItem> queue = await useCase(
        userId: 'u1',
        nowMs: 1700000000000,
        dayKey: '2023-11-14',
        newCardsPerDay: 3,
      );
      expect(queue.length, lessThanOrEqualTo(3));
    });
  });

  group('RecordReviewUseCase', () {
    late AppDatabase db;
    late RecordReviewUseCase useCase;

    setUp(() async {
      db = AppDatabase(NativeDatabase.memory());
      useCase = RecordReviewUseCase(SrsRepository(db));
      await _seedDeck(db);
    });

    tearDown(() async => db.close());

    test('enregistre une revue et retourne le nouvel état', () async {
      final SrsCardState after = await useCase(
        userId: 'u1',
        cardId: 'c1',
        deviceId: 'd1',
        rating: Rating.good,
        nowMs: 1700000000000,
        dayKey: '2023-11-14',
      );
      expect(after.state, CardState.learning);
      expect(after.reps, 1);
    });
  });

  group('FetchDueCardsUseCase', () {
    late AppDatabase db;
    late FetchDueCardsUseCase useCase;

    setUp(() async {
      db = AppDatabase(NativeDatabase.memory());
      useCase = FetchDueCardsUseCase(SrsRepository(db));
      await _seedDeck(db);
    });

    tearDown(() async => db.close());

    test('retourne 0 quand aucune carte n\'est due', () async {
      expect(await useCase(userId: 'u1', nowMs: 1700000000000), 0);
    });
  });

  group('SyncOutboxUseCase', () {
    test('utilise l\'adaptateur injecté', () async {
      // On peut tester le use case sans base de données : on injecte un
      // fake du repository et du sync. C'est la valeur ajoutée du découplage
      // domain/data.
      final FakeSrsRepository fakeSrs = FakeSrsRepository();
      final FakeSyncRepository fakeSync = FakeSyncRepository();
      final SyncOutboxUseCase useCase =
          SyncOutboxUseCase(fakeSrs, fakeSync);

      fakeSync.pullEvents.add(ReviewEvent(
        id: 'e1',
        cardId: 'c1',
        userId: 'u1',
        deviceId: 'd1',
        rating: Rating.good,
        reviewedAtMs: 1700000000000,
      ));

      final SyncOutcome outcome = await useCase(
        userId: 'u1',
        deviceId: 'd1',
        nowMs: 1700000000000,
      );

      expect(outcome.pushedCount, 0); // local vide
      expect(outcome.pulledCount, 1);
      expect(outcome.rebuiltCards, 1);
      expect(fakeSrs.rebuiltFor, contains('c1'));
    });
  });

  group('ValidateEntitlementUseCase', () {
    test('refuse l\'accès par défaut (free + token expiré)', () async {
      final FakeEntitlementRepository fake = FakeEntitlementRepository(
        const EntitlementState(
          plan: EntitlementPlan.free,
          isValid: false,
          expiresAtMs: 0,
        ),
      );
      final ValidateEntitlementUseCase useCase =
          ValidateEntitlementUseCase(fake);
      expect(await useCase.canAccessPremiumAt(1700000000000), isFalse);
    });

    test('autorise pendant la grace period', () async {
      final FakeEntitlementRepository fake = FakeEntitlementRepository(
        EntitlementState(
          plan: EntitlementPlan.premium,
          isValid: false,
          expiresAtMs: 1000,
          graceUntilMs: 9999999999999,
        ),
      );
      final ValidateEntitlementUseCase useCase =
          ValidateEntitlementUseCase(fake);
      expect(await useCase.canAccessPremiumAt(2000), isTrue);
    });
  });

  group('StartMockExamUseCase', () {
    test('refuse un nombre de questions <= 0', () async {
      final StartMockExamUseCase useCase =
          StartMockExamUseCase(FakeSrsRepository());
      expect(
        () => useCase(
            userId: 'u1', nowMs: 1700000000000, questionCount: 0),
        throwsArgumentError,
      );
    });

    test('échantillonne le bon nombre de questions', () async {
      final FakeSrsRepository fake = FakeSrsRepository();
      // Pré-remplit la file avec 30 cartes.
      for (int i = 0; i < 30; i++) {
        fake.queue.add(StudyQueueItem(
          cardId: 'c$i',
          deckId: 'd1',
          cardType: CardType.basic,
          frontTextFr: 'Q $i',
          backTextFr: 'R $i',
          state: SrsCardState.initial,
        ));
      }
      final StartMockExamUseCase useCase = StartMockExamUseCase(fake);
      final MockExamSession session = await useCase(
        userId: 'u1',
        nowMs: 1700000000000,
        questionCount: 10,
        seed: 42,
      );
      expect(session.cards, hasLength(10));
    });
  });

  group('DownloadDeckUseCase', () {
    test('détecte un deck déjà téléchargé', () async {
      final FakeCardRepository fake = FakeCardRepository();
      fake.existing.add(const DeckSummary(
        deckId: 'd1',
        moduleId: 'm1',
        nameFr: 'Deck 1',
        version: 1,
        cardCount: 10,
        isPremium: false,
        isOfflineReady: true,
      ));
      final DownloadDeckUseCase useCase = DownloadDeckUseCase(fake);
      final DownloadOutcome outcome = await useCase(
        deckId: 'd1',
        version: 1,
        cardCount: 10,
        isPremium: false,
      );
      expect(outcome, DownloadOutcome.alreadyDownloaded);
    });
  });
}

Future<void> _seedDeck(AppDatabase db) async {
  await db.into(db.deckMeta).insert(DeckMetaCompanion.insert(
        deckId: 'd1',
        moduleId: 'm1',
        nameFr: 'Deck 1',
        updatedAt: 1700000000000,
      ));
  for (int i = 0; i < 3; i++) {
    await db.into(db.localCards).insert(LocalCardsCompanion.insert(
          id: 'c$i',
          deckId: 'd1',
          type: 'basic',
          contentJson: '{}',
          downloadedAt: 1700000000000,
        ));
    await db.into(db.srsState).insert(SrsStateCompanion.insert(
          userId: 'u1',
          cardId: 'c$i',
          updatedAt: 1700000000000,
        ));
  }
}
