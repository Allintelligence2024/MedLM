// AiRepository — consomme les endpoints IA Phase 18 (Phase 19.5).
//
// Responsabilités :
//   * GET /v1/ai/hints/:cardId       — hint adaptatif pendant l'étude ;
//   * POST /v1/ai/voice-to-card      — dictée → brouillon de carte ;
//   * POST /v1/ai/tutor/ask          — tuteur (disclaimer déjà servi) ;
//   * GET /v1/ai/adaptive/profile    — poids FSRS ajustés (Phase 19.6).
//
// Choix offline-first : un échec réseau sur un hint n'interrompt JAMAIS
// la session d'étude — l'UI masque simplement la bannière (le hint est
// une aide, pas un prérequis).
library;

import '../../network/api_client.dart';
import 'ai_models.dart';

class AiRepository {
  AiRepository({required this.api});

  final ApiClient api;

  /// Cache mémoire des hints (session d'étude) : une carte → un hint
  /// par langue. Le hint dépend de l'état SRS *au moment de la revue* ;
  //  le recalculer à chaque affichage n'apporte rien et coûte des
  /// requêtes. Invalidé explicitement (changement de session/langue).
  final Map<String, AiHint> _hintCache = {};

  // ── Hints ────────────────────────────────────────────────────────

  /// Hint adaptatif pour [cardId]. Résultat mis en cache — appelez
  /// [invalidateHint] si la langue de l'utilisateur change.
  Future<AiHint> hintFor(String cardId, {AiLang? lang}) async {
    final key = '${lang?.wire ?? 'auto'}:$cardId';
    final cached = _hintCache[key];
    if (cached != null) return cached;
    final raw = await api.fetchAiHint(cardId, lang: lang?.wire);
    final hint = AiHint.fromJson(raw);
    _hintCache[key] = hint;
    return hint;
  }

  /// Variante « ne jamais throw » pour l'UI d'étude : null = pas de
  /// bannière (offline, quota, etc. — l'étude continue sans aide).
  Future<AiHint?> hintOrNull(String cardId, {AiLang? lang}) async {
    try {
      return await hintFor(cardId, lang: lang);
    } catch (_) {
      return null;
    }
  }

  void invalidateHint(String cardId) {
    _hintCache.removeWhere((k, _) => k.endsWith(':$cardId'));
  }

  void clearHintCache() => _hintCache.clear();

  // ── Voice-to-card ────────────────────────────────────────────────

  /// Envoie la transcription (STT côté client — chemin préféré, aucun
  /// audio ne quitte l'appareil) et retourne le brouillon de carte.
  ///
  /// [audioBase64] n'est à utiliser que si le STT natif est
  /// indisponible : le serveur transcrira via son provider configuré.
  Future<VoiceDraft> dictateCard({
    required String deckId,
    AiLang lang = AiLang.fr,
    String? transcript,
    String? audioBase64,
  }) async {
    if (transcript == null && audioBase64 == null) {
      throw ArgumentError('transcript ou audioBase64 requis');
    }
    final raw = await api.voiceToCard(
      deckId: deckId,
      lang: lang.wire,
      audioTranscript: transcript,
      audioBase64: audioBase64,
    );
    return VoiceDraft.fromJson(raw);
  }

  // ── Tuteur ───────────────────────────────────────────────────────

  /// Pose une question au tuteur. [history] est la mémoire courte de
  /// la conversation (max 10, plafonné ici aussi pour robustesse).
  ///
  /// Rappel conformité : `answer.disclaimer` est mis en avant par
  /// l'UI ET déjà présent dans `answer.answer` (lecture TTS à voix
  /// haute) — ne jamais filtrer le disclaimer côté client.
  Future<TutorAnswer> askTutor({
    required String question,
    AiLang lang = AiLang.fr,
    List<TutorTurn> history = const [],
  }) async {
    final trimmed = question.trim();
    if (trimmed.length < 3) {
      throw ArgumentError('question trop courte (min 3 caractères)');
    }
    final clipped = history.length > 10
        ? history.sublist(history.length - 10)
        : history;
    final raw = await api.tutorAsk(
      question: trimmed,
      lang: lang.wire,
      history: clipped
          .map((t) => {'role': t.role.wire, 'content': t.content})
          .toList(),
    );
    return TutorAnswer.fromJson(raw);
  }

}

/// Un tour de conversation pour le tuteur.
class TutorTurn {
  const TutorTurn({required this.role, required this.content});

  final TutorRole role;
  final String content;
}

enum TutorRole {
  user('user'),
  assistant('assistant');

  const TutorRole(this.wire);
  final String wire;
}
