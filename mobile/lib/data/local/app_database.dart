/// Base locale MedAnki DZ — source de vérité hors ligne.
///
/// Deux différences majeures avec le prototype Android remplacé :
///
///   * **Migrations réelles.** Le prototype utilisait
///     `fallbackToDestructiveMigration()`, ce qui effaçait toute la progression
///     SRS à chaque changement de schéma. Ici, chaque montée de version est
///     explicite et préserve les données (vérifié par
///     `tools/test_migrations.py`).
///
///   * **Journal protégé par la base.** Deux déclencheurs SQL empêchent la
///     modification et la suppression d'une revue, même en cas de bug
///     applicatif.
library;

import 'package:drift/drift.dart';

import 'tables.dart';

part 'app_database.g.dart';

/// Version courante du schéma local.
const int kSchemaVersion = 2;

@DriftDatabase(
  tables: <Type>[
    DeckMeta,
    LocalCards,
    ReviewLog,
    SrsState,
    OutboxEvents,
    SyncCursor,
    Entitlement,
    StudySessions,
    DailyCounters,
    CardReports,
    UserPrefs,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  @override
  int get schemaVersion => kSchemaVersion;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (Migrator m) async {
          await m.createAll();
          await _createIndexes();
          await _createAppendOnlyGuards();
        },
        onUpgrade: (Migrator m, int from, int to) async {
          // Chaque étape est additive : aucune table n'est recréée, aucune
          // donnée n'est perdue.
          if (from < 2) {
            await m.createTable(cardReports);
            await m.addColumn(localCards, localCards.reportedFlag);
            await m.addColumn(localCards, localCards.publishedAt);
            await m.addColumn(dailyCounters, dailyCounters.freezeUsed);
            await customStatement(
              'CREATE INDEX IF NOT EXISTS idx_reports_unsynced '
              'ON card_reports (user_id, synced, created_at)',
            );
          }
          await _createIndexes();
          await _createAppendOnlyGuards();
        },
        beforeOpen: (OpeningDetails details) async {
          // Indispensable : SQLite désactive les clés étrangères par défaut.
          await customStatement('PRAGMA foreign_keys = ON');
        },
      );

  /// Index dont dépendent les requêtes chaudes (file des cartes dues, rejeu du
  /// journal, sélection des événements à pousser).
  Future<void> _createIndexes() async {
    const List<String> statements = <String>[
      'CREATE INDEX IF NOT EXISTS idx_cards_deck ON local_cards (deck_id)',
      'CREATE INDEX IF NOT EXISTS idx_cards_deck_version '
          'ON local_cards (deck_id, card_version)',
      'CREATE INDEX IF NOT EXISTS idx_review_log_card '
          'ON review_log (user_id, card_id, reviewed_at, id)',
      'CREATE INDEX IF NOT EXISTS idx_review_log_unsynced '
          'ON review_log (user_id, synced, reviewed_at)',
      'CREATE INDEX IF NOT EXISTS idx_review_log_time '
          'ON review_log (user_id, reviewed_at)',
      'CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_state (user_id, due_ms)',
      'CREATE INDEX IF NOT EXISTS idx_srs_state_stats '
          'ON srs_state (user_id, state)',
      'CREATE INDEX IF NOT EXISTS idx_outbox_ready '
          'ON outbox_events (user_id, next_attempt_at, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_user '
          'ON study_sessions (user_id, started_at)',
    ];
    for (final String s in statements) {
      await customStatement(s);
    }
  }

  /// Rend `review_log` append-only au niveau de la base.
  ///
  /// La colonne `synced` reste modifiable : elle décrit l'état de transmission,
  /// pas le contenu de la revue.
  Future<void> _createAppendOnlyGuards() async {
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS review_log_no_update
      BEFORE UPDATE OF id, user_id, card_id, rating, reviewed_at, exam_mode
      ON review_log
      BEGIN
        SELECT RAISE(ABORT, 'review_log est append-only : modification interdite');
      END
    ''');
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS review_log_no_delete
      BEFORE DELETE ON review_log
      BEGIN
        SELECT RAISE(ABORT, 'review_log est append-only : suppression interdite');
      END
    ''');
  }
}
