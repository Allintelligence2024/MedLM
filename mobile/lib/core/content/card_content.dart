/// Contenu bilingue d'une carte.
///
/// Structure identique au JSONB serveur, pour qu'une carte puisse transiter du
/// CMS au mobile sans transformation ni perte.
///
/// Choix v2 : **le français est la langue principale** (public visé : facultés
/// algériennes francophones), l'anglais est un complément — terme médical
/// international, explication optionnelle. Le prototype remplacé était
/// anglais-d'abord, ce qui ne correspondait pas au terrain.
library;

import 'source_meta.dart';

/// Texte disponible en français, éventuellement doublé en anglais.
class LocalizedText {
  const LocalizedText({required this.fr, this.en});

  /// Langue principale : toujours présente.
  final String fr;

  /// Complément international, facultatif.
  final String? en;

  /// Retourne la variante demandée, avec repli sur le français.
  String resolve({bool preferEnglish = false}) {
    if (preferEnglish && en != null && en!.trim().isNotEmpty) return en!;
    return fr;
  }

  bool get hasEnglish => en != null && en!.trim().isNotEmpty;

  static LocalizedText parse(dynamic json,
      {required String field, String? cardId}) {
    if (json is! Map) {
      throw ContentPolicyException(
        'champ "$field" : objet {fr, en} attendu',
        cardId: cardId,
      );
    }
    final Object? fr = json['fr'];
    if (fr is! String || fr.trim().isEmpty) {
      throw ContentPolicyException(
        'champ "$field" : le français est obligatoire',
        cardId: cardId,
      );
    }
    final Object? en = json['en'];
    return LocalizedText(fr: fr, en: en is String ? en : null);
  }

  Map<String, dynamic> toJson() =>
      <String, dynamic>{'fr': fr, if (en != null) 'en': en};
}

/// Média associé à une carte (schéma anatomique, planche histologique…).
class CardMedia {
  const CardMedia({
    required this.type,
    required this.key,
    this.altFr,
    this.altEn,
  });

  /// 'image' ou 'audio'.
  final String type;

  /// Clé de l'objet dans le stockage (R2), pas une URL : l'hôte peut changer.
  final String key;

  final String? altFr;
  final String? altEn;

  static CardMedia parse(Map<String, dynamic> json, {String? cardId}) {
    final Object? key = json['key'];
    if (key is! String || key.isEmpty) {
      throw ContentPolicyException('média sans clé de stockage',
          cardId: cardId);
    }
    return CardMedia(
      type: (json['type'] as String?) ?? 'image',
      key: key,
      altFr: json['alt_fr'] as String?,
      altEn: json['alt_en'] as String?,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'type': type,
        'key': key,
        if (altFr != null) 'alt_fr': altFr,
        if (altEn != null) 'alt_en': altEn,
      };
}

/// Une option de QCM.
class QcmOption {
  const QcmOption({
    required this.id,
    required this.text,
    required this.isCorrect,
    this.explanation,
  });

  /// 'A', 'B', 'C'…
  final String id;
  final LocalizedText text;
  final bool isCorrect;

  /// Explication propre à cette option — obligatoire, y compris pour les
  /// distracteurs : c'est ce qui distingue un outil pédagogique d'un quiz.
  final LocalizedText? explanation;
}

/// Contenu d'une carte BASIC ou CLOZE.
class BasicContent {
  const BasicContent({
    required this.front,
    required this.back,
    this.explanation,
    this.medicalTermEn,
    this.media = const <CardMedia>[],
  });

  final LocalizedText front;
  final LocalizedText back;

  /// Explication clinique : pourquoi, pas seulement quoi.
  final LocalizedText? explanation;

  /// Terme médical international, affiché en permanence (v2 §14).
  final String? medicalTermEn;

  final List<CardMedia> media;
}

/// Contenu d'une carte QCM.
class QcmContent {
  const QcmContent({
    required this.question,
    required this.options,
    this.isMultiple = false,
    this.explanation,
    this.media = const <CardMedia>[],
  });

  final LocalizedText question;
  final List<QcmOption> options;

  /// Vrai si plusieurs réponses sont correctes.
  final bool isMultiple;

  final LocalizedText? explanation;
  final List<CardMedia> media;

  List<QcmOption> get correctOptions =>
      options.where((QcmOption o) => o.isCorrect).toList();
}
