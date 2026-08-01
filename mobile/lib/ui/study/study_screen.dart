// StudyScreen — écran d'étude (Phase UI finale).
//
// Intègre les widgets IA livrés en Phase 19.5 :
//   * [HintBanner] sous la question (clé par carte — recharge quand
//     on avance, masquage silencieux si offline/quota) ;
//   * [VoiceDictationSheet] via l'action microphone de l'AppBar
//     (dictée → brouillon de carte, sans jamais interrompre la
//     session) ;
//   * refresh opportuniste des poids FSRS adaptatifs si le cache est
//     périmé (le vrai refresh périodique est fait par le worker de
//     fond — ici on évite juste de rester périmé longtemps en usage
//     intensif ; fire-and-forget, jamais bloquant).
//
// Boucle offline-first (v2 §4, §14) :
//   * queue construite via BuildStudyQueueUseCase (revues dues AVANT
//     nouvelles cartes, plafond anti-burnout) ;
//   * chaque rating est enregistré immédiatement par
//     RecordReviewUseCase — écriture atomique (journal append-only +
//     outbox), la session survit à un kill de l'app ;
//   * erreur réseau impossible ici : tout est local.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/container/app_container.dart';
import '../../data/repositories/ai/adaptive_params_cache.dart';
import '../../domain/domain.dart';
import '../ai/ai_speech_ports.dart';
import '../ai/hint_banner.dart';
import '../ai/voice_dictation_sheet.dart';

class StudyScreen extends StatefulWidget {
  const StudyScreen({
    super.key,
    required this.container,
    required this.userId,
    this.deckId,
    this.stt = const UnavailableSpeechToText(),
    this.newCardsPerDay = 10,
    this.maxReviewsPerSession = 100,
    @visibleForTesting this.queueLoader,
    @visibleForTesting this.reviewRecorder,
  });

  final AppContainer container;
  final String userId;

  /// Limite la session à un deck (null = tous les decks téléchargés).
  final String? deckId;

  /// Port STT injecté (UnavailableSpeechToText par défaut — la dictée
  /// bascule alors en saisie manuelle dans la feuille).
  final SpeechToTextPort stt;

  final int newCardsPerDay;
  final int maxReviewsPerSession;

  /// Points d'injection réservés aux tests widget (sinon ce sont
  /// `buildStudyQueue` / `recordReview` du container qui sont utilisés).
  final Future<List<StudyQueueItem>> Function(
    String userId,
    int nowMs,
    String dayKey,
  )? queueLoader;

  final Future<void> Function(
    String userId,
    String cardId,
    Rating rating,
    int durationMs,
  )? reviewRecorder;

  @override
  State<StudyScreen> createState() => _StudyScreenState();
}

class _StudyScreenState extends State<StudyScreen> {
  List<StudyQueueItem>? _queue;
  int _index = 0;
  bool _revealed = false;
  String? _error;

  /// Horodatage d'affichage de la carte courante — sert à mesurer
  /// durationMs (métrique FSRS/latence) sans dépendre de l'horloge
  /// murale au moment du rating.
  DateTime _shownAt = DateTime.now();

  /// Compteurs pour l'écran de fin de session.
  int _done = 0;
  int _againCount = 0;

  bool get _finished => _queue != null && _index >= _queue!.length;
  StudyQueueItem? get _current =>
      _finished || _queue == null ? null : _queue![_index];

  @override
  void initState() {
    super.initState();
    _loadQueue();
  }

  Future<void> _loadQueue() async {
    try {
      final now = DateTime.now();
      final loader = widget.queueLoader;
      final List<StudyQueueItem> queue = loader != null
          ? await loader(
              widget.userId, now.millisecondsSinceEpoch, _dayKey(now))
          : await widget.container.buildStudyQueue(
              userId: widget.userId,
              nowMs: now.millisecondsSinceEpoch,
              dayKey: _dayKey(now),
              deckId: widget.deckId,
              newCardsPerDay: widget.newCardsPerDay,
              maxReviewsPerSession: widget.maxReviewsPerSession,
            );
      if (!mounted) return;
      setState(() {
        _queue = queue;
        _index = 0;
        _revealed = false;
        _shownAt = DateTime.now();
      });
      // Refresh opportuniste de l'adaptatif (cache > 6 h) — volontairement
      // non-await : ne jamais retarder la première carte.
      unawaited(_refreshAdaptiveIfStale());
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Impossible de préparer la session.');
      }
    }
  }

  Future<void> _refreshAdaptiveIfStale() async {
    final cache = AdaptiveParamsCache(db: widget.container.database);
    try {
      final existing = await cache.read();
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      if (existing == null || cache.isStale(existing.fetchedAtMs, nowMs)) {
        await refreshAdaptiveFsrsParameters(
          ai: widget.container.aiRepository,
          cache: cache,
          nowMs: nowMs,
        );
      }
    } catch (_) {
      // Jamais bloquant — l'étude continue sur les poids actuels.
    }
  }

  /// Clé jour locale (YYYY-MM-DD) — même convention que le backend
  /// (Africa/Algiers servi par day_key ; ici on dérive de l'horloge
  /// device, cohérent avec le SRS local).
  static String _dayKey(DateTime d) {
    final mm = d.month.toString().padLeft(2, '0');
    final dd = d.day.toString().padLeft(2, '0');
    return '${d.year}-$mm-$dd';
  }

  Future<void> _rate(Rating rating) async {
    final item = _current;
    if (item == null) return;
    final now = DateTime.now();
    final recorder = widget.reviewRecorder;
    try {
      if (recorder != null) {
        await recorder(
          widget.userId,
          item.cardId,
          rating,
          now.difference(_shownAt).inMilliseconds,
        );
      } else {
        final deviceId =
            await widget.container.tokenStorage.getOrCreateDeviceId();
        await widget.container.recordReview(
          userId: widget.userId,
          cardId: item.cardId,
          deviceId: deviceId,
          rating: rating,
          nowMs: now.millisecondsSinceEpoch,
          dayKey: _dayKey(now),
          cardType: item.cardType,
          durationMs: now.difference(_shownAt).inMilliseconds,
        );
      }
    } catch (_) {
      // L'écriture locale est atomique : un échec signalé ici est un
      // incident stockage (plein, corruption) — on le remonte sans
      // casser la navigation.
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Revue non enregistrée (stockage) — réessayez.'),
          ),
        );
      }
      return;
    }
    if (!mounted) return;
    setState(() {
      // La carte sort de la session (le moteur la reprogrammera selon
      // ses propres intervalles — pas de réinsertion locale). Après
      // removeAt, _index pointe déjà sur la carte suivante ; si on
      // vient de retirer la dernière, _finished devient vrai.
      _queue!.removeAt(_index);
      _revealed = false;
      _shownAt = DateTime.now();
      _done += 1;
      if (rating == Rating.again) _againCount += 1;
    });
  }

  Future<void> _openDictation() async {
    final item = _current;
    if (item == null) return;
    final draft = await VoiceDictationSheet.show(
      context,
      repository: widget.container.aiRepository,
      deckId: item.deckId,
      stt: widget.stt,
    );
    if (!mounted || draft == null) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Brouillon créé — ${draft.draftId}')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(_title()),
        actions: [
          if (_current != null)
            IconButton(
              tooltip: 'Dicter une carte',
              onPressed: _openDictation,
              icon: const Icon(Icons.mic_none),
            ),
        ],
      ),
      body: SafeArea(child: _buildBody(scheme)),
    );
  }

  String _title() {
    if (_queue == null) return 'Session d\u2019étude';
    final remaining = _queue!.length - (_finished ? 0 : _index) -
        (_finished ? 0 : 0);
    return '$_done faites · $remaining restantes';
  }

  Widget _buildBody(ColorScheme scheme) {
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: TextStyle(color: scheme.error)),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () {
                setState(() {
                  _error = null;
                  _queue = null;
                });
                _loadQueue();
              },
              child: const Text('Réessayer'),
            ),
          ],
        ),
      );
    }
    if (_queue == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_queue!.isEmpty || _finished) {
      return _buildSummary(scheme);
    }
    return _buildCard(scheme, _current!);
  }

  Widget _buildSummary(ColorScheme scheme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.celebration, size: 48, color: scheme.primary),
            const SizedBox(height: 12),
            Text(
              _done == 0
                  ? 'Rien à réviser — à plus tard !'
                  : 'Session terminée',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (_done > 0) ...[
              const SizedBox(height: 8),
              Text(
                '$_done cartes revues'
                '${_againCount > 0 ? ' · $_againCount à revoir bientôt' : ''}',
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.of(context).maybePop(),
              child: const Text('Terminer'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(ColorScheme scheme, StudyQueueItem item) {
    return Column(
      children: [
        // Bannière d'indice (Phase 19.5) : clé par carte → nouveau
        // fetch quand on change de carte, masquage local si dismiss.
        HintBanner(
          key: ValueKey<String>('hint:${item.cardId}'),
          repository: widget.container.aiRepository,
          cardId: item.cardId,
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  item.frontTextFr,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (_revealed) ...[
                  const SizedBox(height: 16),
                  Divider(color: scheme.outlineVariant),
                  const SizedBox(height: 16),
                  Text(
                    item.backTextFr,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                ],
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
          child: _revealed ? _ratingBar() : _revealButton(),
        ),
      ],
    );
  }

  Widget _revealButton() {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: () => setState(() => _revealed = true),
        child: const Text('Afficher la réponse'),
      ),
    );
  }

  Widget _ratingBar() {
    return Row(
      children: [
        _ratingButton(Rating.again, 'Encore', Colors.red.shade100),
        _ratingButton(Rating.hard, 'Difficile', Colors.orange.shade100),
        _ratingButton(Rating.good, 'Bien', Colors.green.shade100),
        _ratingButton(Rating.easy, 'Facile', Colors.blue.shade100),
      ],
    );
  }

  Widget _ratingButton(Rating rating, String label, Color bg) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: bg,
            foregroundColor: Colors.black87,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          onPressed: () => _rate(rating),
          child: Text(label, style: const TextStyle(fontSize: 13)),
        ),
      ),
    );
  }
}
