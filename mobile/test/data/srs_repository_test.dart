/// Tests de persistance : dépôt SRS sur une base en mémoire.
///
/// La logique SQL sous-jacente est par ailleurs validée directement contre
/// SQLite par `tools/test_repository_logic.py` (20 vérifications), ce qui
/// couvre le cas où le SDK Dart n'est pas disponible en CI.
library;

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:medanki_dz/core/srs/review_event.dart';
import 'package:medanki_dz/core/srs/srs_models.dart';
import 'package:medanki_dz/data/local/app_database.dart';
import 'package:medanki_dz/data/repositories/srs_repository.dart';
import 'package:test/test.dart';

const int t0 = 1700000000000;
const int day = 86400000;
const String user = 'user-1';
const String device = 'device-A';

void main() {
  late AppDatabase db;
  late SrsRepository repo;

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    repo = SrsRepository(db);

    await db.into(db.deckMeta).insert(DeckMetaCompanion.insert(
          deckId: 'd1',
          moduleId: 'anatomie',
          nameFr: 'Anatomie',
          isPremium: const Value<bool>(false),
          updatedAt: t0,
        ));
  });

  tearDown(() async => db.close());

  Future<void> addCard(String id, {String type = 'basic'}) async {
    await db.into(db.localCards).insert(LocalCardsCompanion.insert(
          id: id,
          deckId: 'd1',
          type: type,
          contentJson: '{}',
          downloadedAt: t0,
        ));
    await db.into(db.srsState).insert(SrsStateCompanion.insert(
          userId: user,
          cardId: id,
          updatedAt: t0,
        ));
  }

  group('Enregistrement d\'une revue', () {
    test('journal, file de sortie et état sont écrits ensemble', () async {
      await addCard('c1');
      final SrsCardState s = await repo.recordReview(
        userId: user,
        cardId: 'c1',
        deviceId: device,
        rating: Rating.good,
        nowMs: t0,
        dayKey: '2023-11-14',
      );

      expect(s.state, CardState.learning);
      expect(s.reps, 1);

      final List<ReviewLogRow> log = await db.select(db.reviewLog).get();
      expect(log, hasLength(1));

      final List<OutboxEventRow> outbox =
          await db.select(db.outboxEvents).get();
      expect(outbox, hasLength(1));
      // Même identifiant : le serveur peut dédupliquer un push rejoué.
      expect(outbox.single.id, log.single.id);
      expect(outbox.single.eventType, 'review');
    });

    test('le mode examen journalise sans décaler la planification', () async {
      await addCard('c1');
      final SrsCardState before = await repo.recordReview(
        userId: user, cardId: 'c1', deviceId: device,
        rating: Rating.good, nowMs: t0, dayKey: '2023-11-14',
      );

      await repo.recordReview(
        userId: user, cardId: 'c1', deviceId: device,
        rating: Rating.again, nowMs: t0 + day, dayKey: '2023-11-15',
        examMode: true,
      );

      final SrsCardState after = await repo.stateFor(user, 'c1');
      expect(after.dueMs, before.dueMs);
      expect(after.reps, before.reps);
      expect(await db.select(db.reviewLog).get(), hasLength(2));
    });
  });

  group('Journal append-only', () {
    test('la modification d\'une revue est rejetée par la base', () async {
      await addCard('c1');
      await repo.recordReview(
        userId: user, cardId: 'c1', deviceId: device,
        rating: Rating.good, nowMs: t0, dayKey: '2023-11-14',
      );

      expect(
        () => db.customStatement('UPDATE review_log SET rating = 4'),
        throwsA(anything),
      );
      expect(
        () => db.customStatement('DELETE FROM review_log'),
        throwsA(anything),
      );
    });

    test('le marquage de synchronisation reste possible', () async {
      await addCard('c1');
      await repo.recordReview(
        userId: user, cardId: 'c1', deviceId: device,
        rating: Rating.good, nowMs: t0, dayKey: '2023-11-14',
      );

      final List<ReviewLogRow> pending = await repo.pendingForPush(user);
      expect(pending, hasLength(1));

      await repo.markSynced(<String>[pending.single.id]);
      expect(await repo.pendingForPush(user), isEmpty);
      // La revue elle-même n'a pas disparu.
      expect(await db.select(db.reviewLog).get(), hasLength(1));
    });
  });

  group('Reconstruction depuis le journal', () {
    test('le rejeu redonne exactement l\'état stocké', () async {
      await addCard('c1');
      final List<(Rating, int)> seq = <(Rating, int)>[
        (Rating.good, 0),
        (Rating.good, 0),
        (Rating.good, 4),
        (Rating.again, 18),
        (Rating.good, 18),
      ];
      for (int i = 0; i < seq.length; i++) {
        await repo.recordReview(
          userId: user, cardId: 'c1', deviceId: device,
          rating: seq[i].$1,
          nowMs: t0 + seq[i].$2 * day + i * 1000,
          dayKey: '2023-11-14',
        );
      }

      final SrsCardState stored = await repo.stateFor(user, 'c1');
      final SrsCardState rebuilt = await repo.rebuildFromLog(
          userId: user, cardId: 'c1', nowMs: t0 + 40 * day);

      expect(rebuilt.state, stored.state);
      expect(rebuilt.stability, closeTo(stored.stability, 1e-9));
      expect(rebuilt.difficulty, closeTo(stored.difficulty, 1e-9));
      expect(rebuilt.reps, stored.reps);
      expect(rebuilt.lapses, stored.lapses);
    });
  });

  group('File d\'étude', () {
    test('les cartes dues sortent avant les nouvelles', () async {
      await addCard('due');
      await addCard('neuve');
      await repo.recordReview(
        userId: user, cardId: 'due', deviceId: device,
        rating: Rating.easy, nowMs: t0, dayKey: '2023-11-14',
      );

      final List<QueuedCard> queue = await repo.buildStudyQueue(
        userId: user, nowMs: t0 + 400 * day, dayKey: '2024-12-01',
      );
      expect(queue.first.cardId, 'due');
      expect(queue.map((QueuedCard c) => c.cardId), contains('neuve'));
    });

    test('une carte enterrée est masquée jusqu\'à son échéance', () async {
      await addCard('c1');
      await repo.recordReview(
        userId: user, cardId: 'c1', deviceId: device,
        rating: Rating.easy, nowMs: t0, dayKey: '2023-11-14',
      );
      await repo.bury(userId: user, cardId: 'c1', untilMs: t0 + 500 * day);

      final List<QueuedCard> queue = await repo.buildStudyQueue(
        userId: user, nowMs: t0 + 400 * day, dayKey: '2024-12-01',
      );
      expect(queue.where((QueuedCard c) => c.cardId == 'c1'), isEmpty);
    });

    test('le plafond de nouvelles cartes par jour est respecté', () async {
      for (int i = 0; i < 15; i++) {
        await addCard('c$i');
      }
      final List<QueuedCard> queue = await repo.buildStudyQueue(
        userId: user, nowMs: t0, dayKey: '2023-11-14',
        config: const StudyQueueConfig(newCardsPerDay: 5),
      );
      expect(queue, hasLength(5));
    });
  });

  group('Isolation entre comptes', () {
    test('deux utilisateurs progressent indépendamment', () async {
      await addCard('c1');
      await db.into(db.srsState).insert(SrsStateCompanion.insert(
            userId: 'user-2', cardId: 'c1', updatedAt: t0,
          ));

      await repo.recordReview(
        userId: user, cardId: 'c1', deviceId: device,
        rating: Rating.good, nowMs: t0, dayKey: '2023-11-14',
      );

      expect((await repo.stateFor(user, 'c1')).state, CardState.learning);
      expect((await repo.stateFor('user-2', 'c1')).state, CardState.newCard);
    });
  });

  group('Migration', () {
    test('la version du schéma est bien 2', () {
      expect(db.schemaVersion, kSchemaVersion);
      expect(kSchemaVersion, 2);
    });
  });
}
