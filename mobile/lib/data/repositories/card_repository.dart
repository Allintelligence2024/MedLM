/// Adaptateur `ICardRepository` (couche data).
///
/// Lit deux sources :
///   * le **catalogue local** persisté en Drift (table `local_cards` +
///     `deck_meta`) — c'est l'image du serveur après un pull delta ;
///   * les **fichiers embarqués** dans `assets/content/`, utilisés comme
///     contenu de démarrage (2 decks en Phase 3, plus à venir).
///
/// La [ContentPolicy] est appliquée au chargement : toute carte non
/// conforme est **isolée** (cf. architecture v2 §5.4), pas supprimée avec
/// l'ensemble du deck. Les `rejectedCardIds` permettent de remonter
/// l'incident au CMS lors de la prochaine synchronisation.
library;

import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../core/content/card_content.dart';
import '../../core/content/content_parser.dart';
import '../../core/content/source_meta.dart';
import '../../domain/domain.dart';
import '../local/app_database.dart';

class CardRepository implements ICardRepository {
  CardRepository(this._db, {ContentParser parser = const ContentParser()})
      : _parser = parser;

  final AppDatabase _db;
  final ContentParser _parser;

  @override
  Future<LoadDeckResult> loadDeck(String deckId) async {
    final List<LocalCardRow> rows = await (_db.select(_db.localCards)
          ..where((LocalCards t) => t.deckId.equals(deckId)))
        .get();
    if (rows.isEmpty) {
      return const LoadDeckResult(
          deckId: '', cards: <LoadedCard>[], rejectedCardIds: <String>[]);
    }
    return _rowsToResult(deckId, rows);
  }

  /// Variante : charge un deck depuis un asset JSON bundlé.
  Future<LoadDeckResult> loadBundledDeck(String assetPath) async {
    final String raw = await rootBundle.loadString(assetPath);
    final Map<String, dynamic> json = jsonDecode(raw) as Map<String, dynamic>;
    final ParseResult parsed = _parser.parseDeck(json);
    final String deckId = json['deck_id'] as String;
    final List<LoadedCard> cards = parsed.cards
        .map<LoadedCard>((ParsedCard c) => _parsedToLoaded(c))
        .toList();
    return LoadDeckResult(
      deckId: deckId,
      cards: cards,
      rejectedCardIds:
          parsed.rejected.map((ContentPolicyException e) => e.cardId ?? '?').toList(),
    );
  }

  @override
  Future<List<DeckSummary>> localDecks({bool includePremiumOnly = false}) async {
    final List<DeckMetaRow> rows = await (_db.select(_db.deckMeta)
          ..where((DeckMeta t) =>
              includePremiumOnly ? t.isPremium.equals(true) : const Constant<bool>(true)))
        .get();
    return rows
        .map((DeckMetaRow r) => DeckSummary(
              deckId: r.deckId,
              moduleId: r.moduleId,
              nameFr: r.nameFr,
              version: r.version,
              cardCount: r.cardCount,
              isPremium: r.isPremium,
              isOfflineReady: r.isOfflineReady,
            ))
        .toList();
  }

  @override
  Future<void> recordDeckDownload({
    required String deckId,
    required int version,
    required int cardCount,
    required bool isPremium,
  }) async {
    await _db.into(_db.deckMeta).insertOnConflictUpdate(
          DeckMetaCompanion.insert(
            deckId: deckId,
            moduleId: 'unknown',
            nameFr: deckId,
            version: Value<int>(version),
            cardCount: Value<int>(cardCount),
            isPremium: Value<bool>(isPremium),
            isOfflineReady: const Value<bool>(true),
            canDistribute: const Value<bool>(true),
            updatedAt: DateTime.now().millisecondsSinceEpoch,
          ),
        );
  }

  LoadDeckResult _rowsToResult(String deckId, List<LocalCardRow> rows) {
    final List<LoadedCard> ok = <LoadedCard>[];
    final List<String> ko = <String>[];
    for (final LocalCardRow r in rows) {
      try {
        final Map<String, dynamic> json =
            jsonDecode(r.contentJson) as Map<String, dynamic>;
        final ParsedCard parsed = _parser.parseCard(<String, dynamic>{
          'id': r.id,
          'deck_id': r.deckId,
          'type': r.type,
          'source_meta': jsonDecode(r.sourceMetaJson) as Map<String, dynamic>,
          'content': json,
          'version': r.cardVersion,
          'tags': jsonDecode(r.tagsJson) as List<dynamic>,
          'is_premium': r.isPremium,
        });
        ok.add(_parsedToLoaded(parsed));
      } on ContentPolicyException catch (e) {
        ko.add(e.cardId ?? r.id);
      }
    }
    return LoadDeckResult(deckId: deckId, cards: ok, rejectedCardIds: ko);
  }

  static LoadedCard _parsedToLoaded(ParsedCard c) {
    final bool isQcm = c.type == CardType.qcm;
    final BasicContent? b = c.basic;
    final QcmContent? q = c.qcm;
    return LoadedCard(
      id: c.id,
      deckId: c.deckId,
      type: c.type,
      sourceType: c.sourceMeta.sourceType.wire,
      frontFr: isQcm ? q!.question.fr : b!.front.fr,
      backFr: isQcm
          ? (q!.options.map((QcmOption o) => '${o.id}. ${o.text.fr}').join('\n'))
          : b!.back.fr,
      explanationFr:
          (isQcm ? q!.explanation?.fr : b!.explanation?.fr) ?? '',
      frontEn: isQcm ? q!.question.en : b!.front.en,
      backEn: isQcm
          ? (q!.options
              .where((QcmOption o) => o.text.hasEnglish)
              .map((QcmOption o) => '${o.id}. ${o.text.en}')
              .join('\n'))
          : b!.back.en,
      explanationEn: isQcm ? q!.explanation?.en : b!.explanation?.en,
      medicalTermEn: b?.medicalTermEn,
      tags: c.tags,
      isPremium: c.isPremium,
      version: c.version,
    );
  }
}
