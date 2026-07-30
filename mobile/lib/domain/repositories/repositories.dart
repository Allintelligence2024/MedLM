/// Contrats de repository — la couche domaine ne connaît que ces interfaces.
///
/// Conformément à la Clean Architecture (doc v2 §3), le domaine définit
/// **ce dont il a besoin** sans savoir **comment** c'est implémenté. Les
/// classes de `data/` fourniront les implémentations (Drift, Dio, R2, etc.)
/// qui satisfont ces interfaces.
///
/// Règle d'or : aucune méthode ici ne peut mentionner Drift, SQLite, HTTP,
/// JSON, un fichier, ou un type Flutter. Si c'est le cas, c'est qu'elle
/// appartient à la couche data.
library;

import '../entities/entities.dart';

/// File d'étude construite pour un utilisateur, à un instant donné.
class StudyQueueItem {
  const StudyQueueItem({
    required this.cardId,
    required this.deckId,
    required this.cardType,
    required this.frontTextFr,
    this.frontTextEn,
    this.backTextFr,
    this.backTextEn,
    required this.state,
  });

  final String cardId;
  final String deckId;
  final CardType cardType;
  final String frontTextFr;
  final String? frontTextEn;
  final String? backTextFr;
  final String? backTextEn;
  final SrsCardState state;
}

/// Vue agrégée pour le tableau de bord.
class DashboardSnapshot {
  const DashboardSnapshot({
    required this.dueCount,
    required this.newCount,
    required this.streakDays,
    required this.xpTotal,
    required this.entitlement,
  });

  final int dueCount;
  final int newCount;
  final int streakDays;
  final int xpTotal;
  final EntitlementState entitlement;
}

/// État d'entitlement tel que vu par le domaine (cache local).
///
/// Le serveur reste la seule source de vérité (doc v2 §8.1). Le mobile
/// vérifie localement la signature du JWT reçu et expose cet état dérivé.
enum EntitlementPlan { free, premium, promo }

class EntitlementState {
  const EntitlementState({
    required this.plan,
    required this.isValid,
    required this.expiresAtMs,
    this.graceUntilMs,
  });

  final EntitlementPlan plan;

  /// Signature vérifiée et non expirée (ou grace period active).
  final bool isValid;

  /// Timestamp d'expiration du JWT, en ms epoch.
  final int expiresAtMs;

  /// Timestamp de fin de grace period (null = pas de grace).
  final int? graceUntilMs;

  /// L'utilisateur peut-il accéder aux decks premium à [nowMs] ?
  bool canAccessPremiumAt(int nowMs) {
    if (isValid && expiresAtMs > nowMs) return true;
    if (graceUntilMs != null && graceUntilMs! > nowMs) return true;
    return false;
  }

  static const EntitlementState freeDefault = EntitlementState(
    plan: EntitlementPlan.free,
    isValid: true,
    expiresAtMs: 0,
  );
}

/// Contrat : journal immuable + projection d'état + file d'étude.
///
/// C'est le composant le plus critique de l'architecture (doc v2 §14) : la
/// perte d'une revue est le seul bug irrattrapable.
abstract class ISrsRepository {
  /// État courant d'une carte, ou l'état initial si jamais vue.
  Future<SrsCardState> stateFor(String userId, String cardId);

  /// Construit la file d'étude : revues dues d'abord, puis nouvelles cartes.
  ///
  /// Le plafond [maxReviewsPerSession] est un garde-fou anti-burnout
  /// (architecture v2 §4). Le nombre de nouvelles cartes par jour est
  /// configurable par l'utilisateur (5 / 10 / 20).
  Future<List<StudyQueueItem>> buildStudyQueue({
    required String userId,
    required int nowMs,
    required String dayKey,
    String? deckId,
    int newCardsPerDay = 10,
    int maxReviewsPerSession = 100,
  });

  /// Enregistre une revue et retourne le nouvel état.
  ///
  /// L'opération est **atomique** : journal, file de sortie et projection
  /// d'état sont écrits dans la même transaction (cf. implémentation Drift).
  Future<SrsCardState> recordReview({
    required String userId,
    required String cardId,
    required String deviceId,
    required Rating rating,
    required int nowMs,
    required String dayKey,
    CardType cardType = CardType.basic,
    int durationMs = 0,
    bool examMode = false,
  });

  /// Reconstruit l'état d'une carte en rejouant son journal.
  ///
  /// `fold` étant déterministe, le résultat est garanti correct. Utilisé
  /// après une synchronisation (Phase 8) ou pour réparer une incohérence.
  Future<SrsCardState> rebuildFromLog({
    required String userId,
    required String cardId,
    required int nowMs,
  });

  /// Nombre de cartes dues, pour le tableau de bord.
  Future<int> dueCount(String userId, int nowMs);

  /// Événements en attente d'envoi, les plus anciens d'abord.
  Future<List<ReviewEvent>> pendingForPush(String userId, {int limit = 100});

  /// Marque des revues comme transmises. N'altère pas leur contenu.
  Future<void> markSynced(List<String> eventIds);

  /// Reporte une carte au lendemain (bury siblings).
  Future<void> bury({
    required String userId,
    required String cardId,
    required int untilMs,
  });
}

/// Contrat : accès aux cartes et aux decks (lecture seule pour le domaine).
///
/// L'écriture (publication, mise à jour, takedown) est un acte éditorial
/// qui ne traverse pas le domaine — elle vit dans la couche CMS (Phase 11).
abstract class ICardRepository {
  /// Charge un deck entier (métadonnées + cartes validées).
  ///
  /// La [ContentPolicy] est appliquée ici : toute carte non conforme est
  /// isolée et signalée via [LoadDeckResult.rejected], pas jetée avec
  /// l'ensemble du deck.
  Future<LoadDeckResult> loadDeck(String deckId);

  /// Liste des decks téléchargés localement.
  Future<List<DeckSummary>> localDecks({bool includePremiumOnly = false});

  /// Marque un deck comme téléchargé (ou met à jour sa version).
  Future<void> recordDeckDownload({
    required String deckId,
    required int version,
    required int cardCount,
    required bool isPremium,
  });
}

/// Une carte déjà validée, prête à être affichée ou planifiée.
class LoadedCard {
  const LoadedCard({
    required this.id,
    required this.deckId,
    required this.type,
    required this.sourceType,
    required this.frontFr,
    required this.backFr,
    required this.explanationFr,
    this.frontEn,
    this.backEn,
    this.explanationEn,
    this.medicalTermEn,
    this.tags = const <String>[],
    this.isPremium = true,
    this.version = 1,
  });

  final String id;
  final String deckId;
  final CardType type;

  /// Type de provenance (original / inspired / partnership). Conservé pour
  /// l'attribution affichée à l'étudiant (v2 §14).
  final String sourceType;

  final String frontFr;
  final String backFr;
  final String explanationFr;
  final String? frontEn;
  final String? backEn;
  final String? explanationEn;
  final String? medicalTermEn;
  final List<String> tags;
  final bool isPremium;
  final int version;
}

class DeckSummary {
  const DeckSummary({
    required this.deckId,
    required this.moduleId,
    required this.nameFr,
    required this.version,
    required this.cardCount,
    required this.isPremium,
    required this.isOfflineReady,
  });

  final String deckId;
  final String moduleId;
  final String nameFr;
  final int version;
  final int cardCount;
  final bool isPremium;
  final bool isOfflineReady;
}

class LoadDeckResult {
  const LoadDeckResult({
    required this.deckId,
    required this.cards,
    required this.rejectedCardIds,
  });

  final String deckId;
  final List<LoadedCard> cards;
  final List<String> rejectedCardIds;
}

/// Contrat : vérification offline de l'entitlement.
///
/// Le serveur signe un JWT RS256 ; le client vérifie la signature avec une
/// clé publique embarquée. Aucune de ces méthodes n'effectue d'appel
/// réseau — la phase 8 câblera le rafraîchissement.
abstract class IEntitlementRepository {
  /// État courant, tel que vu localement.
  Future<EntitlementState> current();

  /// Stocke un nouveau token (signé par le serveur) et met à jour l'état.
  Future<void> storeToken({
    required String userId,
    required String signedToken,
    required int expiresAtMs,
    int? graceUntilMs,
  });
}

/// Contrat : file de sortie des événements destinés au serveur.
abstract class ISyncRepository {
  /// Envoie un lot d'événements locaux (push) et retourne ceux qui ont été
  /// acceptés par le serveur. Implémentation Phase 8 — pour l'instant, ce
  /// contrat est défini pour que les cas d'utilisation ne dépendent pas de
  /// la couche réseau.
  Future<SyncPushOutcome> pushPending({
    required String userId,
    required String deviceId,
    int maxBatch = 100,
  });

  /// Récupère les événements distants depuis le curseur [sinceMs] (pull).
  Future<SyncPullOutcome> pullSince({
    required String userId,
    required String deviceId,
    required int sinceMs,
  });

  /// Marque tous les événements locaux comme synchronisés.
  Future<void> markAllSynced(String userId, Iterable<String> eventIds);
}

class SyncPushOutcome {
  const SyncPushOutcome({
    required this.acceptedIds,
    this.rejectedIds = const <String>[],
  });
  final List<String> acceptedIds;
  final List<String> rejectedIds;
}

class SyncPullOutcome {
  const SyncPullOutcome({
    required this.events,
    required this.nextCursorMs,
  });
  final List<ReviewEvent> events;
  final int nextCursorMs;
}
