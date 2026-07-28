/// Journal des revues — événement immuable, append-only.
///
/// C'est la **source de vérité** de la progression d'un étudiant. L'état SRS
/// (`SrsCardState`) n'est qu'une projection recalculable de ce journal.
///
/// Conséquences architecturales (v2, §4) :
///   * un événement n'est **jamais** modifié ni supprimé ;
///   * la synchronisation multi-appareil se fait par union de journaux, ce qui
///     rend le merge déterministe et exempt de perte (contrairement au
///     "last-write-wins" sur l'état) ;
///   * `id` est un UUID v7, donc ordonnable dans le temps : deux appareils
///     hors ligne produisent des identifiants triables sans coordination.
library;

import 'dart:math';

import 'srs_models.dart';

/// Une revue effectuée par un utilisateur sur une carte.
class ReviewEvent {
  const ReviewEvent({
    required this.id,
    required this.cardId,
    required this.userId,
    required this.deviceId,
    required this.rating,
    required this.reviewedAtMs,
    this.durationMs = 0,
    this.cardType = CardType.basic,
    this.examMode = false,
  });

  /// UUID v7 (ordonnable par le temps). Sert de clé d'idempotence lors du push.
  final String id;

  final String cardId;
  final String userId;

  /// Identifiant de l'appareil émetteur — indispensable pour auditer les
  /// conflits de synchronisation.
  final String deviceId;

  final Rating rating;

  /// Horodatage de la revue (epoch ms).
  ///
  /// Rempli par l'horloge locale hors ligne, puis réconcilié avec l'horloge
  /// serveur lors de la synchronisation (Phase 6).
  final int reviewedAtMs;

  /// Temps de réflexion, en millisecondes.
  final int durationMs;

  final CardType cardType;

  /// Si vrai, l'événement est conservé pour les statistiques mais **exclu du
  /// planificateur** : passer un examen blanc ne doit pas décaler les révisions.
  final bool examMode;

  ReviewEvent copyWith({
    String? id,
    String? cardId,
    String? userId,
    String? deviceId,
    Rating? rating,
    int? reviewedAtMs,
    int? durationMs,
    CardType? cardType,
    bool? examMode,
  }) {
    return ReviewEvent(
      id: id ?? this.id,
      cardId: cardId ?? this.cardId,
      userId: userId ?? this.userId,
      deviceId: deviceId ?? this.deviceId,
      rating: rating ?? this.rating,
      reviewedAtMs: reviewedAtMs ?? this.reviewedAtMs,
      durationMs: durationMs ?? this.durationMs,
      cardType: cardType ?? this.cardType,
      examMode: examMode ?? this.examMode,
    );
  }

  /// Format de transport (identique au corps JSON de `POST /sync/push`).
  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'card_id': cardId,
        'user_id': userId,
        'device_id': deviceId,
        'rating': rating.value,
        'duration_ms': durationMs,
        'card_type': cardType.wire,
        'reviewed_at': reviewedAtMs,
        'exam_mode': examMode,
      };

  static ReviewEvent fromJson(Map<String, dynamic> json) {
    return ReviewEvent(
      id: json['id'] as String,
      cardId: json['card_id'] as String,
      userId: json['user_id'] as String,
      deviceId: json['device_id'] as String,
      rating: Rating.fromValue(json['rating'] as int),
      reviewedAtMs: json['reviewed_at'] as int,
      durationMs: (json['duration_ms'] as int?) ?? 0,
      cardType: CardType.fromWire((json['card_type'] as String?) ?? 'basic'),
      examMode: (json['exam_mode'] as bool?) ?? false,
    );
  }

  @override
  bool operator ==(Object other) => other is ReviewEvent && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() =>
      'ReviewEvent($id, card=$cardId, rating=${rating.value}, at=$reviewedAtMs)';
}

/// Générateur d'UUID v7 (RFC 9562) : 48 bits d'horodatage puis aléatoire.
///
/// Deux avantages sur l'UUID v4 pour un journal synchronisé :
///   * le tri lexicographique correspond au tri chronologique ;
///   * l'insertion en base reste séquentielle (pas de fragmentation d'index).
class UuidV7 {
  UuidV7({Random? random}) : _random = random ?? Random.secure();

  final Random _random;

  /// Génère un UUID v7 pour l'instant [nowMs] (par défaut : maintenant).
  String generate({int? nowMs}) {
    final int ts = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    final List<int> bytes = List<int>.filled(16, 0);

    // 48 bits d'horodatage big-endian.
    bytes[0] = (ts >> 40) & 0xFF;
    bytes[1] = (ts >> 32) & 0xFF;
    bytes[2] = (ts >> 24) & 0xFF;
    bytes[3] = (ts >> 16) & 0xFF;
    bytes[4] = (ts >> 8) & 0xFF;
    bytes[5] = ts & 0xFF;

    for (int i = 6; i < 16; i++) {
      bytes[i] = _random.nextInt(256);
    }

    // Version 7 sur les 4 bits de poids fort de l'octet 6.
    bytes[6] = (bytes[6] & 0x0F) | 0x70;
    // Variante RFC 4122 sur les 2 bits de poids fort de l'octet 8.
    bytes[8] = (bytes[8] & 0x3F) | 0x80;

    final String hex =
        bytes.map((int b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }
}
