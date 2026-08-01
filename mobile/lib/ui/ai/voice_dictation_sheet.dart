// VoiceDictationSheet — dictée vocale → brouillon de carte (Phase 19.5).
//
// Branchée sur POST /v1/ai/voice-to-card (Phase 18.3). Conformité :
//   * chemin préféré = STT côté client ([SpeechToTextPort]) : seul le
//     TEXTE part au serveur, jamais l'audio (v2 §10) ;
//   * si le STT natif est indisponible, l'étudiant peut taper/coller la
//     transcription — l'upload audio reste un repli explicite ;
//   * le résultat est un BROUILLON (draft) : rien n'est publié sans
//     relecture, le message `next_step` du serveur le rappelle.
library;

import 'package:flutter/material.dart';

import '../../data/network/api_exceptions.dart';
import '../../data/repositories/ai/ai_models.dart';
import '../../data/repositories/ai/ai_repository.dart';
import 'ai_speech_ports.dart';
import '../../l10n/app_localizations.dart';

class VoiceDictationSheet extends StatefulWidget {
  const VoiceDictationSheet({
    super.key,
    required this.repository,
    required this.deckId,
    required this.stt,
    this.lang = AiLang.fr,
  });

  final AiRepository repository;
  final String deckId;
  final SpeechToTextPort stt;
  final AiLang lang;

  /// Ouvre la feuille modale ; retourne le [VoiceDraft] créé (ou null
  /// si l'utilisateur a annulé).
  static Future<VoiceDraft?> show(
    BuildContext context, {
    required AiRepository repository,
    required String deckId,
    required SpeechToTextPort stt,
    AiLang lang = AiLang.fr,
  }) {
    return showModalBottomSheet<VoiceDraft>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: VoiceDictationSheet(
          repository: repository,
          deckId: deckId,
          stt: stt,
          lang: lang,
        ),
      ),
    );
  }

  @override
  State<VoiceDictationSheet> createState() => _VoiceDictationSheetState();
}

class _VoiceDictationSheetState extends State<VoiceDictationSheet> {
  final TextEditingController _transcript = TextEditingController();
  bool _sttAvailable = false;
  bool _listening = false;
  bool _submitting = false;
  /// Motif de l'erreur affichée — un CODE, pas une phrase (le texte est
  /// résolu au rendu pour suivre la langue courante, audit P1-4).
  _VoiceError? _error;
  VoiceDraft? _draft;

  @override
  void initState() {
    super.initState();
    widget.stt.isAvailable().then((ok) {
      if (mounted) setState(() => _sttAvailable = ok);
    });
  }

  @override
  void dispose() {
    _transcript.dispose();
    super.dispose();
  }

  Future<void> _toggleListening() async {
    if (_listening) {
      final text = await widget.stt.stop();
      if (mounted) {
        setState(() {
          _listening = false;
          if (text.isNotEmpty) _transcript.text = text;
        });
      }
      return;
    }
    setState(() {
      _error = null;
      _listening = true;
    });
    try {
      await widget.stt.start(
        localeId: aiLocaleId(widget.lang.wire),
        onPartial: (partial) {
          if (mounted) _transcript.text = partial;
        },
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _listening = false;
          _error = _VoiceError.micUnavailable;
        });
      }
    }
  }

  Future<void> _submit() async {
    final text = _transcript.text.trim();
    if (text.length < 3) {
      setState(() => _error = _VoiceError.tooShort);
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final draft = await widget.repository.dictateCard(
        deckId: widget.deckId,
        lang: widget.lang,
        transcript: text,
      );
      if (mounted) setState(() => _draft = draft);
    } on ThrottleException {
      if (mounted) {
        setState(() => _error = _VoiceError.quota);
      }
    } on NetworkException {
      if (mounted) {
        setState(() => _error = _VoiceError.offline);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = _VoiceError.draftFailed);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: _draft != null ? _buildDraft(scheme) : _buildCapture(scheme),
      ),
    );
  }

  Widget _buildCapture(ColorScheme scheme) {
    final l10n = AppLocalizations.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l10n.voiceTitle,
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          l10n.voiceHelpFull,
          style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _transcript,
          minLines: 3,
          maxLines: 6,
          maxLength: 2000,
          decoration: InputDecoration(
            hintText: _listening
                ? l10n.voiceListening
                : l10n.voiceTranscriptLabel,
            border: const OutlineInputBorder(),
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_voiceErrorMessage(l10n, _error!),
                style: TextStyle(color: scheme.error, fontSize: 13)),
          ),
        Row(
          children: [
            if (_sttAvailable)
              IconButton.filled(
                tooltip: _listening ? l10n.tutorStopDictation : l10n.voiceDictate,
                onPressed: _submitting ? null : _toggleListening,
                icon: Icon(_listening ? Icons.stop : Icons.mic),
              )
            else
              Tooltip(
                message: 'STT indisponible — saisie manuelle',
                child: Icon(Icons.mic_off, color: scheme.outline),
              ),
            const Spacer(),
            FilledButton.icon(
              onPressed: _submitting ? null : _submit,
              icon: _submitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.auto_awesome),
              label: Text(
                _submitting ? l10n.voiceCreating : l10n.voiceCreateDraft,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildDraft(ColorScheme scheme) {
    final draft = _draft!;
    final l10n = AppLocalizations.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l10n.voiceDraftCreated,
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        _draftTile(l10n.voiceFront, draft.formatted.front),
        _draftTile(l10n.voiceBack, draft.formatted.back),
        Text(
          l10n.voiceRuleAndQuota(
            draft.formatted.rule,
            draft.remainingQuotaToday,
          ),
          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
        ),
        if (draft.nextStep.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(draft.nextStep,
                style: TextStyle(fontSize: 13, color: scheme.primary)),
          ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(draft),
          child: Text(l10n.studyFinish),
        ),
      ],
    );
  }

  Widget _draftTile(String label, String content) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
          Text(content),
        ],
      ),
    );
  }
}

/// Motifs d'erreur de la feuille de dictée.
enum _VoiceError { micUnavailable, tooShort, quota, offline, draftFailed }

String _voiceErrorMessage(AppLocalizations l10n, _VoiceError error) =>
    switch (error) {
      _VoiceError.micUnavailable => l10n.voiceMicUnavailable,
      _VoiceError.tooShort => l10n.voiceTooShort,
      _VoiceError.quota => l10n.voiceQuotaReached,
      _VoiceError.offline => l10n.voiceOffline,
      _VoiceError.draftFailed => l10n.voiceDraftFailed,
    };
