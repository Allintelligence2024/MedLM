/// Logique du compte à rebours d'examen — pure, donc testable.
///
/// Principe non négociable (v2 §10) : **le serveur fait autorité sur le
/// temps**. Il renvoie un `expires_at` absolu ; le client se contente
/// d'afficher la différence avec l'heure courante. Un client qui
/// décompterait lui-même serait triché en changeant l'heure du
/// téléphone ou en tuant l'application.
library;

/// Lit l'instant d'expiration renvoyé par le serveur.
///
/// Accepte les deux formes rencontrées dans les réponses : ISO-8601
/// (`expires_at`) et epoch millisecondes (`expires_at_ms`).
DateTime? parseExpiry(Map<String, dynamic> attempt) {
  final ms = attempt['expires_at_ms'];
  if (ms is num) {
    return DateTime.fromMillisecondsSinceEpoch(ms.toInt(), isUtc: true);
  }
  final iso = attempt['expires_at'];
  if (iso is String && iso.isNotEmpty) {
    return DateTime.tryParse(iso)?.toUtc();
  }
  return null;
}

/// Temps restant, jamais négatif.
Duration remaining(DateTime expiresAt, DateTime now) {
  final delta = expiresAt.difference(now);
  return delta.isNegative ? Duration.zero : delta;
}

/// L'examen est-il terminé du point de vue du temps ?
bool isExpired(DateTime? expiresAt, DateTime now) {
  if (expiresAt == null) return false;
  return !now.isBefore(expiresAt);
}

/// Formatage `mm:ss`, ou `h:mm:ss` au-delà d'une heure.
String formatRemaining(Duration d) {
  final totalSeconds = d.inSeconds;
  final hours = totalSeconds ~/ 3600;
  final minutes = (totalSeconds % 3600) ~/ 60;
  final seconds = totalSeconds % 60;
  final mm = minutes.toString().padLeft(2, '0');
  final ss = seconds.toString().padLeft(2, '0');
  return hours > 0 ? '$hours:$mm:$ss' : '$mm:$ss';
}

/// Faut-il alerter visuellement ? (dernières 2 minutes)
bool isUrgent(Duration remaining) =>
    remaining.inSeconds > 0 && remaining.inSeconds <= 120;

/// Extrait la liste des questions, quelle que soit l'enveloppe.
List<Map<String, dynamic>> parseQuestions(Map<String, dynamic> attempt) {
  final raw = attempt['questions'];
  if (raw is List) {
    return raw.whereType<Map>().map(Map<String, dynamic>.from).toList();
  }
  return const [];
}
