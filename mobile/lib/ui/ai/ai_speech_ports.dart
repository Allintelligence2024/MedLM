// Ports STT / TTS (Phase 19.5).
//
// L'UI IA ne dépend JAMAIS d'un plugin natif directement : elle parle à
// deux interfaces. Cela conserve :
//   * la testabilité (fakes en mémoire — pas de device en CI) ;
//   * le provider-agnosticisme (speech_to_text, whisper local, ou STT
//     OS : le choix est injecté, jamais codé en dur) ;
//   * la conformité vie privée : le chemin préféré envoie le TEXTE
//     transcrit au backend, jamais l'audio (v2 §10).
//
// Implémentations réelles (plugins `speech_to_text` / `flutter_tts`)
// branchées au composition root (main) — elles nécessitent un device
// et restent hors du test harness.
library;

/// Port de reconnaissance vocale (dictée).
abstract class SpeechToTextPort {
  /// true si le STT est utilisable (permission micro accordée, moteur
  /// présent). Sinon l'UI bascule sur la saisie manuelle du transcript.
  Future<bool> isAvailable();

  /// Démarre l'écoute dans la langue BCP-47 [localeId] (ex. `fr-DZ`,
  /// `ar-DZ`). [onPartial] reçoit les transcriptions intermédiaires.
  Future<void> start({
    required String localeId,
    void Function(String partial)? onPartial,
  });

  /// Arrête l'écoute et retourne la transcription finale.
  Future<String> stop();

  /// Annule sans résultat.
  Future<void> cancel();
}

/// Port de synthèse vocale (lecture des réponses du tuteur).
abstract class TextToSpeechPort {
  Future<bool> isAvailable();

  /// Lit [text] à voix haute dans la langue BCP-47 [localeId].
  ///
  /// Conformité : pour les réponses du tuteur, [text] DOIT être le
  /// champ `answer` servi — il contient déjà le disclaimer médical
  /// (tutor.policy.ts) ; ne jamais le retirer avant lecture.
  Future<void> speak(String text, {required String localeId});

  Future<void> stop();
}

/// STT absent (appareil sans moteur, permission refusée, tests) — la
/// dictée tombe alors en saisie manuelle, l'audio n'est jamais exigé.
class UnavailableSpeechToText implements SpeechToTextPort {
  const UnavailableSpeechToText();

  @override
  Future<bool> isAvailable() async => false;

  @override
  Future<void> start({
    required String localeId,
    void Function(String partial)? onPartial,
  }) async {
    throw StateError('STT indisponible sur cet appareil');
  }

  @override
  Future<String> stop() async => '';

  @override
  Future<void> cancel() async {}
}

/// TTS absent — le bouton « Écouter » est simplement masqué.
class UnavailableTextToSpeech implements TextToSpeechPort {
  const UnavailableTextToSpeech();

  @override
  Future<bool> isAvailable() async => false;

  @override
  Future<void> speak(String text, {required String localeId}) async {
    throw StateError('TTS indisponible sur cet appareil');
  }

  @override
  Future<void> stop() async {}
}

/// Mappe la langue de l'app vers un localeId BCP-47 algérien plausible.
String aiLocaleId(String langWire) {
  switch (langWire) {
    case 'ar':
      return 'ar-DZ';
    case 'en':
      return 'en-US';
    default:
      return 'fr-DZ';
  }
}
