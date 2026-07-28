/// Tables Drift — reflet exact du schéma SQL validé.
///
/// Le schéma de référence est `schema/v1.sql` et `schema/v2.sql`, testés
/// réellement contre SQLite (`tools/test_migrations.py`, 30 vérifications).
/// Les définitions ci-dessous doivent rester alignées sur ces fichiers : le
/// test `tools/check_schema_parity.py` échoue si ce n'est plus le cas.
library;

import 'package:drift/drift.dart';

/// Métadonnées d'un deck téléchargé localement.
@DataClassName('DeckMetaRow')
class DeckMeta extends Table {
  TextColumn get deckId => text()();
  TextColumn get moduleId => text()();
  TextColumn get nameFr => text()();
  TextColumn get nameEn => text().withDefault(const Constant(''))();
  TextColumn get descriptionFr => text().withDefault(const Constant(''))();

  /// Version côté serveur, base du pull delta (`version > cursor`).
  IntColumn get version => integer().withDefault(const Constant(1))();
  IntColumn get cardCount => integer().withDefault(const Constant(0))();
  BoolColumn get isPremium => boolean().withDefault(const Constant(true))();

  /// Faux tant que cartes et médias ne sont pas intégralement téléchargés.
  BoolColumn get isOfflineReady =>
      boolean().withDefault(const Constant(false))();

  /// Retrait à distance sans redéploiement (exigence légale, v2 §5.4).
  BoolColumn get canDistribute => boolean().withDefault(const Constant(true))();

  TextColumn get coverImageKey => text().nullable()();
  IntColumn get downloadedAt => integer().nullable()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{deckId};
}

/// Carte téléchargée. Le contenu bilingue est stocké tel quel (même structure
/// que le JSONB serveur) pour éviter toute perte à la désérialisation.
@DataClassName('LocalCardRow')
class LocalCards extends Table {
  TextColumn get id => text()();
  TextColumn get deckId =>
      text().references(DeckMeta, #deckId, onDelete: KeyAction.cascade)();
  TextColumn get type => text()();
  TextColumn get contentJson => text()();

  /// Provenance et licence — une carte sans source valide ne doit pas exister.
  TextColumn get sourceMetaJson =>
      text().withDefault(const Constant('{}'))();
  TextColumn get tagsJson => text().withDefault(const Constant('[]'))();
  IntColumn get cardVersion => integer().withDefault(const Constant(1))();
  IntColumn get difficultyHint => integer().nullable()();
  BoolColumn get isPremium => boolean().withDefault(const Constant(true))();

  /// Vrai si [contentJson] est chiffré (deck premium hors ligne, Phase 8).
  BoolColumn get encryptedFlag =>
      boolean().withDefault(const Constant(false))();
  BoolColumn get reportedFlag =>
      boolean().withDefault(const Constant(false))();
  IntColumn get publishedAt => integer().nullable()();
  IntColumn get downloadedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Journal des revues — **append-only**.
///
/// Deux déclencheurs SQL interdisent `UPDATE` et `DELETE` sur les colonnes de
/// contenu. Seul `synced` peut évoluer. Perdre une revue est le seul bug
/// irrattrapable de cette architecture : la protection est dans la base, pas
/// seulement dans le code applicatif.
@DataClassName('ReviewLogRow')
class ReviewLog extends Table {
  /// UUID v7, ordonnable dans le temps.
  TextColumn get id => text()();
  TextColumn get userId => text()();
  TextColumn get cardId => text()();
  TextColumn get deviceId => text()();
  IntColumn get rating => integer()();
  IntColumn get durationMs => integer().withDefault(const Constant(0))();
  TextColumn get cardType => text()();

  /// Conservée pour les statistiques mais exclue du planificateur.
  BoolColumn get examMode => boolean().withDefault(const Constant(false))();
  IntColumn get reviewedAt => integer()();
  IntColumn get receivedAt => integer()();
  BoolColumn get synced => boolean().withDefault(const Constant(false))();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Projection courante de l'état SRS, entièrement recalculable via `fold`.
@DataClassName('SrsStateRow')
class SrsState extends Table {
  TextColumn get userId => text()();
  TextColumn get cardId => text()();
  TextColumn get state => text().withDefault(const Constant('new'))();
  RealColumn get stability => real().withDefault(const Constant(0))();
  RealColumn get difficulty => real().withDefault(const Constant(0))();
  IntColumn get elapsedDays => integer().withDefault(const Constant(0))();
  IntColumn get scheduledDays => integer().withDefault(const Constant(0))();
  IntColumn get reps => integer().withDefault(const Constant(0))();
  IntColumn get lapses => integer().withDefault(const Constant(0))();
  IntColumn get lastReviewMs => integer().nullable()();
  IntColumn get dueMs => integer().nullable()();
  BoolColumn get isLeech => boolean().withDefault(const Constant(false))();

  /// Report volontaire (bury siblings) : carte masquée jusqu'à cette date.
  IntColumn get buriedUntilMs => integer().nullable()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{userId, cardId};
}

/// File de sortie : découple l'enregistrement local de l'envoi réseau.
@DataClassName('OutboxEventRow')
class OutboxEvents extends Table {
  TextColumn get id => text()();
  TextColumn get userId => text()();
  TextColumn get eventType => text()();
  TextColumn get payloadJson => text()();
  IntColumn get createdAt => integer()();
  IntColumn get retryCount => integer().withDefault(const Constant(0))();

  /// Backoff exponentiel : ne pas réessayer avant cette date.
  IntColumn get nextAttemptAt => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Curseurs de synchronisation, par appareil.
@DataClassName('SyncCursorRow')
class SyncCursor extends Table {
  TextColumn get userId => text()();
  TextColumn get deviceId => text()();
  IntColumn get lastPullCursor => integer().withDefault(const Constant(0))();
  IntColumn get lastPushAt => integer().nullable()();
  IntColumn get lastPullAt => integer().nullable()();
  IntColumn get contentCursor => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{userId, deviceId};
}

/// Cache local du droit d'accès.
///
/// Le serveur reste la seule source de vérité : ce jeton est signé (RS256) et
/// uniquement *vérifié* hors ligne via la clé publique embarquée.
@DataClassName('EntitlementRow')
class Entitlement extends Table {
  TextColumn get userId => text()();
  TextColumn get plan => text().withDefault(const Constant('free'))();
  TextColumn get signedToken => text().nullable()();
  IntColumn get expiresAt => integer().nullable()();

  /// Tolérance réseau : l'accès reste ouvert un temps après expiration.
  IntColumn get graceUntil => integer().nullable()();
  TextColumn get allowedDecksJson =>
      text().withDefault(const Constant('[]'))();
  IntColumn get refreshedAt => integer().nullable()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{userId};
}

/// Séances d'étude, pour les statistiques et la gamification (Phase 9).
@DataClassName('StudySessionRow')
class StudySessions extends Table {
  TextColumn get id => text()();
  TextColumn get userId => text()();
  TextColumn get deckId => text().nullable()();
  IntColumn get startedAt => integer()();
  IntColumn get endedAt => integer().nullable()();
  IntColumn get cardsDueAtStart => integer().withDefault(const Constant(0))();
  IntColumn get cardsReviewed => integer().withDefault(const Constant(0))();
  IntColumn get correctCount => integer().withDefault(const Constant(0))();
  IntColumn get xpEarned => integer().withDefault(const Constant(0))();
  BoolColumn get synced => boolean().withDefault(const Constant(false))();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Compteurs quotidiens : plafond de nouvelles cartes et garde-fou anti-burnout.
@DataClassName('DailyCounterRow')
class DailyCounters extends Table {
  TextColumn get userId => text()();

  /// Clé de jour `YYYY-MM-DD` en heure **locale** : la journée d'étude d'un
  /// étudiant est celle de son fuseau, pas celle du serveur.
  TextColumn get dayKey => text()();
  IntColumn get newCardsDone => integer().withDefault(const Constant(0))();
  IntColumn get reviewsDone => integer().withDefault(const Constant(0))();
  IntColumn get freezeUsed => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{userId, dayKey};
}

/// Signalements d'erreur émis par l'étudiant, en attente d'envoi.
@DataClassName('CardReportRow')
class CardReports extends Table {
  TextColumn get id => text()();
  TextColumn get userId => text()();
  TextColumn get cardId => text()();
  TextColumn get reason => text()();
  TextColumn get comment => text().withDefault(const Constant(''))();
  IntColumn get createdAt => integer()();
  BoolColumn get synced => boolean().withDefault(const Constant(false))();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{id};
}

/// Préférences légères (remplace l'usage de Hive prévu en v2).
@DataClassName('UserPrefRow')
class UserPrefs extends Table {
  TextColumn get userId => text()();
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => <Column<Object>>{userId, key};
}
