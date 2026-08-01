// TutorChatScreen — chat tuteur IA avec dictée (STT) et écoute (TTS).
// Phase 19.5, branchée sur POST /v1/ai/tutor/ask (Phase 18.6).
//
// CONFORMITÉ NON NÉGOCIABLE (miroir de tutor.policy.ts) :
//   * le disclaimer médical est SERVI dans `answer` (donc lu par le
//     TTS) ET mis en avant par l'UI via le champ `disclaimer` — il
//     n'existe AUCUNE copie du texte légal côté mobile (source unique
//     côté serveur, cf. PHASE_19_3_RAPPORT.md) ;
//   * les réponses `emergency: true` sont stylées en alerte : le texte
//     contient déjà les numéros d'urgence algériens (SAMU 115...) ;
//   * quota serveur (30/j) affiché ; un 429 ferme gentiment l'entrée.
library;

import 'package:flutter/material.dart';

import '../../data/network/api_exceptions.dart';
import '../../data/repositories/ai/ai_models.dart';
import '../../data/repositories/ai/ai_repository.dart';
import 'ai_speech_ports.dart';

class TutorChatScreen extends StatefulWidget {
  const TutorChatScreen({
    super.key,
    required this.repository,
    required this.stt,
    required this.tts,
    this.lang = AiLang.fr,
  });

  final AiRepository repository;
  final SpeechToTextPort stt;
  final TextToSpeechPort tts;
  final AiLang lang;

  @override
  State<TutorChatScreen> createState() => _TutorChatScreenState();
}

class _ChatMessage {
  const _ChatMessage({
    required this.role,
    required this.text,
    this.answer,
  });

  final TutorRole role;
  final String text;

  /// Réponse structurée pour les messages assistant (disclaimer,
  /// emergency, TTS).
  final TutorAnswer? answer;
}

class _TutorChatScreenState extends State<TutorChatScreen> {
  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();
  final List<_ChatMessage> _messages = [];

  bool _sttAvailable = false;
  bool _ttsAvailable = false;
  bool _listening = false;
  bool _sending = false;
  int? _remainingQuota;
  String? _bannerError;

  /// Disclaimer du dernier échange — bandeau persistant tant qu'il est
  /// connu (le texte vient du SERVEUR, jamais codé ici).
  String? _disclaimer;

  @override
  void initState() {
    super.initState();
    widget.stt.isAvailable().then((ok) {
      if (mounted) setState(() => _sttAvailable = ok);
    });
    widget.tts.isAvailable().then((ok) {
      if (mounted) setState(() => _ttsAvailable = ok);
    });
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  List<TutorTurn> _history() {
    return _messages
        .map((m) => TutorTurn(role: m.role, content: m.text))
        .toList();
  }

  Future<void> _send() async {
    final question = _input.text.trim();
    if (question.length < 3 || _sending) return;
    setState(() {
      _sending = true;
      _bannerError = null;
      _messages.add(_ChatMessage(role: TutorRole.user, text: question));
      _input.clear();
    });
    _scrollToBottom();
    try {
      final answer = await widget.repository.askTutor(
        question: question,
        lang: widget.lang,
        history: _history(),
      );
      if (!mounted) return;
      setState(() {
        _messages.add(_ChatMessage(
          role: TutorRole.assistant,
          text: answer.answer,
          answer: answer,
        ));
        _remainingQuota = answer.remainingQuotaToday;
        if (answer.disclaimer.isNotEmpty) _disclaimer = answer.disclaimer;
      });
      _scrollToBottom();
    } on ThrottleException {
      if (mounted) {
        setState(() {
          _bannerError =
              'Quota tuteur du jour atteint — réessayez demain.';
          _remainingQuota = 0;
        });
      }
    } on NetworkException {
      if (mounted) {
        setState(() =>
            _bannerError = 'Pas de réseau — le tuteur nécessite une connexion.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _bannerError = 'Le tuteur est momentanément indisponible.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _toggleDictation() async {
    if (_listening) {
      final text = await widget.stt.stop();
      if (mounted) {
        setState(() {
          _listening = false;
          if (text.isNotEmpty) _input.text = text;
        });
      }
      return;
    }
    setState(() => _listening = true);
    try {
      await widget.stt.start(
        localeId: aiLocaleId(widget.lang.wire),
        onPartial: (partial) {
          if (mounted) _input.text = partial;
        },
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _listening = false;
          _bannerError = 'Micro indisponible — saisissez votre question.';
        });
      }
    }
  }

  Future<void> _speak(TutorAnswer answer) async {
    // CONFORMITÉ : on lit `answer` tel que servi — le disclaimer est
    // inclus dans le texte parlé (jamais filtré).
    await widget.tts.speak(
      answer.answer,
      localeId: aiLocaleId(widget.lang.wire),
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  bool get _inputDisabled => _sending || _remainingQuota == 0;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tuteur IA'),
        actions: [
          if (_remainingQuota != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Text(
                  '$_remainingQuota restant(s)',
                  style: TextStyle(fontSize: 12, color: scheme.outline),
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          if (_disclaimer != null)
            Container(
              width: double.infinity,
              color: scheme.secondaryContainer,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Text(
                _disclaimer!,
                style: TextStyle(
                  fontSize: 12,
                  color: scheme.onSecondaryContainer,
                ),
              ),
            )
          else
            Container(
              width: double.infinity,
              color: scheme.surfaceContainerHighest,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Text(
                'Assistant de révision : posez une question de cours '
                '(anatomie, physiologie, biochimie…).',
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ),
          if (_bannerError != null)
            Container(
              width: double.infinity,
              color: scheme.errorContainer,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Text(
                _bannerError!,
                style: TextStyle(fontSize: 12, color: scheme.onErrorContainer),
              ),
            ),
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.all(12),
              itemCount: _messages.length,
              itemBuilder: (context, i) =>
                  _MessageBubble(message: _messages[i], onSpeak: _speakIfAvailable),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (_sttAvailable)
                    IconButton(
                      tooltip: _listening ? 'Arrêter la dictée' : 'Dicter',
                      onPressed: _inputDisabled ? null : _toggleDictation,
                      icon: Icon(_listening ? Icons.stop_circle : Icons.mic),
                    ),
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 1000,
                      enabled: !_inputDisabled,
                      decoration: const InputDecoration(
                        hintText: 'Votre question de cours…',
                        border: OutlineInputBorder(),
                        counterText: '',
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Envoyer',
                    onPressed: _inputDisabled ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void Function(TutorAnswer)? get _speakIfAvailable =>
      _ttsAvailable ? _speak : null;
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, this.onSpeak});

  final _ChatMessage message;
  final void Function(TutorAnswer)? onSpeak;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUser = message.role == TutorRole.user;
    final answer = message.answer;
    final emergency = answer?.emergency ?? false;

    final Color bg;
    final Color fg;
    if (isUser) {
      bg = scheme.primaryContainer;
      fg = scheme.onPrimaryContainer;
    } else if (emergency) {
      bg = scheme.errorContainer;
      fg = scheme.onErrorContainer;
    } else {
      bg = scheme.surfaceContainerHighest;
      fg = scheme.onSurface;
    }

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.85,
        ),
        child: Card(
          color: bg,
          elevation: 0,
          margin: const EdgeInsets.symmetric(vertical: 4),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (emergency)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.emergency_share,
                            size: 16, color: scheme.error),
                        const SizedBox(width: 4),
                        Text(
                          'Urgence détectée',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: scheme.error,
                          ),
                        ),
                      ],
                    ),
                  ),
                SelectableText(message.text, style: TextStyle(color: fg)),
                if (answer != null &&
                    answer.disclaimer.isNotEmpty &&
                    !emergency)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      answer.disclaimer,
                      style: TextStyle(
                        fontSize: 11,
                        fontStyle: FontStyle.italic,
                        color: fg.withOpacity(0.7),
                      ),
                    ),
                  ),
                if (answer != null && onSpeak != null)
                  Align(
                    alignment: Alignment.centerRight,
                    child: IconButton(
                      visualDensity: VisualDensity.compact,
                      tooltip: 'Écouter (disclaimer inclus)',
                      icon: const Icon(Icons.volume_up, size: 18),
                      onPressed: () => onSpeak!(answer),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
