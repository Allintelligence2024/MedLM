/// Analyse et validation du contenu embarqué ou téléchargé.
///
/// La checklist qualité de l'architecture v2 (§5.3) est ici **exécutable** :
/// une carte non conforme est refusée au chargement, pas signalée dans un
/// document. Cela vaut pour le contenu bundlé comme pour le contenu reçu du
/// serveur — le client ne fait jamais confiance à sa source.
library;

import 'card_content.dart';
import 'source_meta.dart';
import '../srs/srs_models.dart';

/// Une carte validée, prête à être stockée ou affichée.
class ParsedCard {
  const ParsedCard({
    required this.id,
    required this.deckId,
    required this.type,
    required this.sourceMeta,
    required this.version,
    this.basic,
    this.qcm,
    this.tags = const <String>[],
    this.difficultyHint,
    this.isPremium = true,
  });

  final String id;
  final String deckId;
  final CardType type;
  final SourceMeta sourceMeta;
  final int version;

  /// Renseigné pour les types basic et cloze.
  final BasicContent? basic;

  /// Renseigné pour le type qcm.
  final QcmContent? qcm;

  final List<String> tags;
  final int? difficultyHint;
  final bool isPremium;
}

/// Résultat d'un chargement : les cartes valides et les rejets motivés.
///
/// On ne fait pas échouer tout un deck pour une carte défectueuse : l'étudiant
/// doit pouvoir réviser. Les rejets sont collectés pour être remontés (ils
/// signalent un bug du CMS, pas une erreur de l'utilisateur).
class ParseResult {
  const ParseResult({required this.cards, required this.rejected});

  final List<ParsedCard> cards;
  final List<ContentPolicyException> rejected;

  bool get hasRejections => rejected.isNotEmpty;
}

class ContentParser {
  const ContentParser({this.strict = false});

  /// Si vrai, la première carte non conforme interrompt le chargement.
  /// Utilisé par les tests et l'outil de validation du CMS.
  final bool strict;

  /// Analyse un manifeste de deck complet.
  ParseResult parseDeck(Map<String, dynamic> json) {
    final Object? rawCards = json['cards'];
    if (rawCards is! List) {
      throw ContentPolicyException('manifeste sans liste "cards"');
    }
    final String deckId = json['deck_id'] as String? ??
        (throw ContentPolicyException('manifeste sans "deck_id"'));

    final List<ParsedCard> ok = <ParsedCard>[];
    final List<ContentPolicyException> ko = <ContentPolicyException>[];

    for (final Object? raw in rawCards) {
      try {
        if (raw is! Map<String, dynamic>) {
          throw const ContentPolicyException('entrée de carte invalide');
        }
        ok.add(parseCard(raw, defaultDeckId: deckId));
      } on ContentPolicyException catch (e) {
        if (strict) rethrow;
        ko.add(e);
      }
    }
    return ParseResult(cards: ok, rejected: ko);
  }

  /// Analyse et valide une carte isolée.
  ParsedCard parseCard(Map<String, dynamic> json, {String? defaultDeckId}) {
    final String? id = json['id'] as String?;
    if (id == null || id.isEmpty) {
      throw ContentPolicyException('carte sans identifiant');
    }

    final String? deckId = (json['deck_id'] as String?) ?? defaultDeckId;
    if (deckId == null) {
      throw ContentPolicyException('carte sans deck', cardId: id);
    }

    final String? typeWire = json['type'] as String?;
    final CardType type;
    try {
      type = CardType.fromWire(typeWire ?? '');
    } on ArgumentError {
      throw ContentPolicyException(
        'type de carte inconnu : $typeWire (attendu basic, cloze ou qcm)',
        cardId: id,
      );
    }

    // Garde-fou légal : refuse toute carte sans provenance déclarée.
    final SourceMeta source = SourceMeta.parse(
      json['source_meta'] as Map<String, dynamic>?,
      cardId: id,
    );

    // Takedown : une carte retirée n'est jamais chargée, même si elle est
    // déjà présente dans un fichier embarqué.
    if (!source.canDistributeOffline) {
      throw ContentPolicyException(
        'carte retirée de la distribution (can_distribute_offline = false)',
        cardId: id,
      );
    }

    final Object? content = json['content'];
    if (content is! Map<String, dynamic>) {
      throw ContentPolicyException('carte sans bloc "content"', cardId: id);
    }

    final ParsedCard card = ParsedCard(
      id: id,
      deckId: deckId,
      type: type,
      sourceMeta: source,
      version: (json['version'] as int?) ?? 1,
      basic: type == CardType.qcm ? null : _parseBasic(content, id),
      qcm: type == CardType.qcm ? _parseQcm(content, id) : null,
      tags: ((json['tags'] as List<dynamic>?) ?? <dynamic>[])
          .whereType<String>()
          .toList(),
      difficultyHint: json['difficulty_hint'] as int?,
      isPremium: (json['is_premium'] as bool?) ?? true,
    );

    _enforceQualityChecklist(card);
    return card;
  }

  BasicContent _parseBasic(Map<String, dynamic> c, String id) {
    return BasicContent(
      front: LocalizedText.parse(c['front'], field: 'front', cardId: id),
      back: LocalizedText.parse(c['back'], field: 'back', cardId: id),
      explanation: c['explanation'] == null
          ? null
          : LocalizedText.parse(c['explanation'],
              field: 'explanation', cardId: id),
      medicalTermEn: c['medical_term_en'] as String?,
      media: _parseMedia(c['media'], id),
    );
  }

  QcmContent _parseQcm(Map<String, dynamic> c, String id) {
    final Object? rawOptions = c['options'];
    if (rawOptions is! List || rawOptions.length < 2) {
      throw ContentPolicyException(
        'un QCM doit proposer au moins deux options',
        cardId: id,
      );
    }

    final List<QcmOption> options = <QcmOption>[];
    for (final Object? raw in rawOptions) {
      if (raw is! Map<String, dynamic>) {
        throw ContentPolicyException('option de QCM invalide', cardId: id);
      }
      final String? optId = raw['id'] as String?;
      if (optId == null || optId.isEmpty) {
        throw ContentPolicyException('option de QCM sans identifiant',
            cardId: id);
      }
      options.add(QcmOption(
        id: optId,
        text: LocalizedText.parse(raw, field: 'option $optId', cardId: id),
        isCorrect: (raw['is_correct'] as bool?) ?? false,
        explanation: raw['explanation_fr'] == null
            ? null
            : LocalizedText(
                fr: raw['explanation_fr'] as String,
                en: raw['explanation_en'] as String?,
              ),
      ));
    }

    return QcmContent(
      question: LocalizedText.parse(c['question'], field: 'question', cardId: id),
      options: options,
      isMultiple: (c['is_multiple'] as bool?) ?? false,
      explanation: c['explanation'] == null
          ? null
          : LocalizedText.parse(c['explanation'],
              field: 'explanation', cardId: id),
      media: _parseMedia(c['media'], id),
    );
  }

  List<CardMedia> _parseMedia(Object? raw, String cardId) {
    if (raw == null) return const <CardMedia>[];
    if (raw is! List) {
      throw ContentPolicyException('champ "media" : liste attendue',
          cardId: cardId);
    }
    return raw
        .whereType<Map<String, dynamic>>()
        .map((Map<String, dynamic> m) => CardMedia.parse(m, cardId: cardId))
        .toList();
  }

  /// Checklist qualité de l'architecture v2, rendue exécutable.
  void _enforceQualityChecklist(ParsedCard card) {
    final String id = card.id;

    if (card.type == CardType.qcm) {
      final QcmContent qcm = card.qcm!;
      final int correct = qcm.correctOptions.length;

      if (correct == 0) {
        throw ContentPolicyException('QCM sans bonne réponse', cardId: id);
      }
      if (!qcm.isMultiple && correct > 1) {
        throw ContentPolicyException(
          'QCM à réponse unique comportant $correct bonnes réponses '
          '(activer is_multiple ?)',
          cardId: id,
        );
      }
      if (qcm.isMultiple && correct == 1) {
        throw ContentPolicyException(
          'QCM déclaré multiple mais ne comportant qu\'une bonne réponse',
          cardId: id,
        );
      }

      // Identifiants d'options uniques : sans cela, la réponse de l'étudiant
      // serait ambiguë.
      final Set<String> ids = qcm.options.map((QcmOption o) => o.id).toSet();
      if (ids.length != qcm.options.length) {
        throw ContentPolicyException('identifiants d\'options dupliqués',
            cardId: id);
      }

      // Chaque distracteur doit être expliqué : c'est la valeur pédagogique.
      for (final QcmOption o in qcm.options) {
        if (o.explanation == null) {
          throw ContentPolicyException(
            'option ${o.id} sans explication (obligatoire, y compris pour '
            'les distracteurs)',
            cardId: id,
          );
        }
      }
    } else {
      final BasicContent b = card.basic!;
      // Une carte de rappel sans explication clinique n'enseigne que la
      // réponse ; la v2 l'interdit.
      if (b.explanation == null) {
        throw ContentPolicyException(
          'carte sans explication clinique',
          cardId: id,
        );
      }
    }

    // Toute image doit porter un texte alternatif français (accessibilité et
    // repli en cas de média non téléchargé).
    final List<CardMedia> media =
        card.type == CardType.qcm ? card.qcm!.media : card.basic!.media;
    for (final CardMedia m in media) {
      if (m.type == 'image' && (m.altFr == null || m.altFr!.trim().isEmpty)) {
        throw ContentPolicyException(
          'image "${m.key}" sans texte alternatif français',
          cardId: id,
        );
      }
    }
  }
}
