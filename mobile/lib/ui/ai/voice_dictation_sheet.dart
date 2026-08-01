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
  String? _error;
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
          _error = 'Micro indisponible — saisissez le texte à la place.';
        });
      }
    }
  }

  Future<void> _submit() async {
    final text = _transcript.text.trim();
    if (text.length < 3) {
      setState(() => _error = 'Transcription trop courte (min 3 caractères).');
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
        setState(() => _error =
            'Quota vocal du jour atteint — réessayez demain.');
      }
    } on NetworkException {
      if (mounted) {
        setState(() => _error =
            'Pas de réseau : la dictée sera possible dès le retour de la connexion.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Échec de la création du brouillon.');
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
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Dicter une carte',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          'Parlez naturellement : la carte est formatée automatiquement '
          'et relue avant publication.',
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
                ? 'Écoute en cours…'
                : 'Transcription (dictée ou saisie manuelle)',
            border: const OutlineInputBorder(),
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!,
                style: TextStyle(color: scheme.error, fontSize: 13)),
          ),
        Row(
          children: [
            if (_sttAvailable)
              IconButton.filled(
                tooltip: _listening ? 'Arrêter la dictée' : 'Dicter',
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
              label: Text(_submitting ? 'Création…' : 'Créer le brouillon'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildDraft(ColorScheme scheme) {
    final draft = _draft!;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Brouillon créé',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        _draftTile('Recto', draft.formatted.front),
        _draftTile('Verso', draft.formatted.back),
        Text(
          'Règle appliquée : ${draft.formatted.rule} · '
          'quota restant : ${draft.remainingQuotaToday}',
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
          child: const Text('Terminer'),
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
