/// Provenance et licence d'une carte — garde-fou légal (architecture v2, §5.4).
///
/// Le contenu est le principal actif de MedAnki DZ, et aussi son principal
/// risque : copier une annale officielle expose à une réclamation des
/// enseignants ou des facultés. La règle est donc inscrite dans le type :
/// **une carte sans provenance valide ne peut pas exister en mémoire.**
///
/// Le parser ([SourceMeta.parse]) rejette toute carte dont `source_type` est
/// absent ou inconnu ; il n'y a pas de valeur par défaut permissive.
library;

/// Origine autorisée d'une carte.
enum SourceType {
  /// Créée de zéro par l'équipe MedAnki.
  original('original'),

  /// Inspirée du thème d'une annale, mais intégralement reformulée.
  inspired('inspired'),

  /// Issue d'un accord écrit (club étudiant, enseignant partenaire).
  partnership('partnership');

  const SourceType(this.wire);

  final String wire;

  static SourceType? tryParse(String? wire) {
    for (final SourceType t in SourceType.values) {
      if (t.wire == wire) return t;
    }
    return null;
  }
}

/// Erreur de conformité du contenu.
class ContentPolicyException implements Exception {
  const ContentPolicyException(this.message, {this.cardId});

  final String message;
  final String? cardId;

  @override
  String toString() => 'ContentPolicyException'
      '${cardId != null ? ' [$cardId]' : ''}: $message';
}

/// Métadonnées de provenance attachées à chaque carte.
class SourceMeta {
  const SourceMeta({
    required this.sourceType,
    this.faculty,
    this.year,
    this.module,
    this.attribution,
    this.canDistributeOffline = true,
    this.license = 'medankidz_internal_v1',
    this.notes,
  });

  final SourceType sourceType;

  /// Faculté d'origine (Alger, Oran, Constantine…), à titre informatif.
  final String? faculty;
  final int? year;
  final String? module;

  /// Mention obligatoire pour une carte issue d'un partenariat.
  final String? attribution;

  /// Faux = retrait immédiat : la carte ne doit plus être distribuée hors
  /// ligne. Sert de mécanisme de takedown sans redéploiement.
  final bool canDistributeOffline;

  final String license;
  final String? notes;

  /// Analyse un bloc `source_meta`, en refusant tout ce qui n'est pas conforme.
  ///
  /// [cardId] n'est utilisé que pour produire un message d'erreur exploitable.
  static SourceMeta parse(Map<String, dynamic>? json, {String? cardId}) {
    if (json == null || json.isEmpty) {
      throw ContentPolicyException(
        'source_meta absent : toute carte doit déclarer sa provenance',
        cardId: cardId,
      );
    }

    final SourceType? type = SourceType.tryParse(json['source_type'] as String?);
    if (type == null) {
      throw ContentPolicyException(
        "source_type invalide ou manquant (reçu: ${json['source_type']}). "
        'Valeurs autorisées : original, inspired, partnership',
        cardId: cardId,
      );
    }

    final String? attribution = json['attribution'] as String?;
    // Un contenu de partenaire non attribué est un risque juridique direct.
    if (type == SourceType.partnership &&
        (attribution == null || attribution.trim().isEmpty)) {
      throw ContentPolicyException(
        'une carte de type "partnership" doit porter une attribution',
        cardId: cardId,
      );
    }

    // Une carte inspirée d'une annale doit documenter la reformulation, faute
    // de quoi rien ne distingue l'inspiration de la copie.
    if (type == SourceType.inspired) {
      final String? notes = json['notes'] as String?;
      if (notes == null || notes.trim().isEmpty) {
        throw ContentPolicyException(
          'une carte de type "inspired" doit documenter sa reformulation '
          'dans le champ notes',
          cardId: cardId,
        );
      }
    }

    return SourceMeta(
      sourceType: type,
      faculty: json['faculty'] as String?,
      year: json['year'] as int?,
      module: json['module'] as String?,
      attribution: attribution,
      canDistributeOffline:
          (json['can_distribute_offline'] as bool?) ?? true,
      license: (json['license'] as String?) ?? 'medankidz_internal_v1',
      notes: json['notes'] as String?,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'source_type': sourceType.wire,
        if (faculty != null) 'faculty': faculty,
        if (year != null) 'year': year,
        if (module != null) 'module': module,
        if (attribution != null) 'attribution': attribution,
        'can_distribute_offline': canDistributeOffline,
        'license': license,
        if (notes != null) 'notes': notes,
      };
}
