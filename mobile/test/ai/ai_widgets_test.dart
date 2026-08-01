// Tests widget Phase 19.5 — HintBanner, VoiceDictationSheet, TutorChatScreen.
//
// Conformité vérifiée :
//   * le HintBanner n'affiche rien en cas d'erreur (offline-first) ;
//   * la feuille de dictée produit un brouillon relu avant publication ;
//   * le tuteur affiche le disclaimer SERVI (jamais codé en dur côté
//     client), stylise les urgences, et propose le TTS sur `answer`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/data/network/api_client.dart';
import 'package:medanki_dz/data/repositories/ai/ai_models.dart';
import 'package:medanki_dz/data/repositories/ai/ai_repository.dart';
import 'package:medanki_dz/ui/ai/ai_speech_ports.dart';
import 'package:medanki_dz/ui/ai/hint_banner.dart';
import 'package:medanki_dz/ui/ai/tutor_chat_screen.dart';
import 'package:medanki_dz/ui/ai/voice_dictation_sheet.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient({this.hintFails = false})
      : super(baseUrl: 'http://test', tokenStorage: _NoopStorage());

  final bool hintFails;

  static const String kDisclaimer = '⚠️ DISCLAIMER-SERVI';

  @override
  Future<Map<String, dynamic>> fetchAiHint(String cardId,
      {String? lang}) async {
    if (hintFails) throw Exception('offline');
    return <String, dynamic>{
      'card_id': cardId,
      'category': 'leech_help',
      'hint': 'HINT-TEST : ancrez « pape » à une image mentale.',
      'lang': 'fr',
      'experience_level': 'beginner',
      'personalized': true,
      'based_on': const ['lapses=3'],
      'generated_at': '2026-08-01T09:00:00.000Z',
    };
  }

  @override
  Future<Map<String, dynamic>> voiceToCard({
    required String deckId,
    String lang = 'fr',
    String? audioTranscript,
    String? audioBase64,
  }) async {
    return <String, dynamic>{
      'job_id': 'j1',
      'draft_id': 'd1',
      'transcript': audioTranscript ?? '',
      'formatted': const {
        'front': 'QUESTION-FORMATEE',
        'back': 'REPONSE-FORMATEE',
        'rule': 'definition',
      },
      'transcriber': const {
        'provider': 'mock',
        'model': 'deterministic',
        'confidence': 0.99,
      },
      'lang': lang,
      'remaining_quota_today': 49,
      'next_step': 'NEXT-STEP-TEST',
    };
  }

  @override
  Future<Map<String, dynamic>> tutorAsk({
    required String question,
    String lang = 'fr',
    List<Map<String, String>> history = const [],
  }) async {
    final emergency = question.toLowerCase().contains('urgence');
    return <String, dynamic>{
      'answer': 'REPONSE-TUTEUR $kDisclaimer',
      'disclaimer': kDisclaimer,
      'emergency': emergency,
      'within_scope': true,
      'provider': 'mock',
      'model': 'deterministic',
      'remaining_quota_today': 29,
    };
  }
}

class _NoopStorage implements dynamic {
  @override
  noSuchMethod(Invocation invocation) async => null;
}

/// STT scripté : disponible, produit un texte fixe à l'arrêt.
class ScriptedSpeechToText implements SpeechToTextPort {
  ScriptedSpeechToText({this.script = 'transcription scriptée'});

  final String script;
  final List<String> partials = <String>[];
  int starts = 0;

  @override
  Future<bool> isAvailable() async => true;

  @override
  Future<void> start({
    required String localeId,
    void Function(String partial)? onPartial,
  }) async {
    starts++;
    onPartial?.call(script);
  }

  @override
  Future<String> stop() async => script;

  @override
  Future<void> cancel() async {}
}

/// TTS espion : enregistre le texte lu (le disclaimer DOIT y figurer).
class RecordingTextToSpeech implements TextToSpeechPort {
  final List<String> spoken = <String>[];

  @override
  Future<bool> isAvailable() async => true;

  @override
  Future<void> speak(String text, {required String localeId}) async {
    spoken.add(text);
  }

  @override
  Future<void> stop() async {}
}

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  group('HintBanner', () {
    testWidgets('affiche le hint servi', (tester) async {
      final repo = AiRepository(api: FakeApiClient());
      await tester.pumpWidget(
          _wrap(HintBanner(repository: repo, cardId: 'c1')));
      await tester.pumpAndSettle();
      expect(find.textContaining('HINT-TEST'), findsOneWidget);
      expect(find.text('Pourquoi cet indice ?'), findsOneWidget);
    });

    testWidgets('erreur réseau → bannière invisible, étude intacte',
        (tester) async {
      final repo = AiRepository(api: FakeApiClient(hintFails: true));
      await tester.pumpWidget(
          _wrap(HintBanner(repository: repo, cardId: 'c1')));
      await tester.pumpAndSettle();
      expect(find.textContaining('HINT-TEST'), findsNothing);
    });
  });

  group('VoiceDictationSheet', () {
    testWidgets('dictée STT → soumission → brouillon affiché',
        (tester) async {
      final repo = AiRepository(api: FakeApiClient());
      final stt = ScriptedSpeechToText();
      await tester.pumpWidget(_wrap(VoiceDictationSheet(
        repository: repo,
        deckId: 'd1',
        stt: stt,
      )));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Dicter'));
      await tester.pumpAndSettle();
      expect(stt.starts, 1);

      await tester.tap(find.text('Créer le brouillon'));
      await tester.pumpAndSettle();

      expect(find.text('QUESTION-FORMATEE'), findsOneWidget);
      expect(find.text('REPONSE-FORMATEE'), findsOneWidget);
      expect(find.textContaining('NEXT-STEP-TEST'), findsOneWidget);
    });
  });

  group('TutorChatScreen', () {
    testWidgets('disclaimer SERVI affiché en bandeau + bulle + TTS le '
        'lit', (tester) async {
      final api = FakeApiClient();
      final repo = AiRepository(api: api);
      final tts = RecordingTextToSpeech();
      await tester.pumpWidget(_wrap(TutorChatScreen(
        repository: repo,
        stt: const UnavailableSpeechToText(),
        tts: tts,
      )));
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byType(TextField).last, 'explique la glycolyse');
      await tester.tap(find.byTooltip('Envoyer'));
      await tester.pumpAndSettle();

      // Bandeau persistant + pied de bulle : le disclaimer vient du serveur.
      expect(find.text(FakeApiClient.kDisclaimer), findsWidgets);
      expect(find.text('29 restant(s)'), findsOneWidget);

      // TTS : le texte lu est `answer` — il contient le disclaimer.
      await tester.tap(find.byTooltip('Écouter (disclaimer inclus)'));
      await tester.pumpAndSettle();
      expect(tts.spoken.single, contains(FakeApiClient.kDisclaimer));
    });

    testWidgets('question d\u2019urgence → styling alerte', (tester) async {
      final repo = AiRepository(api: FakeApiClient());
      await tester.pumpWidget(_wrap(TutorChatScreen(
        repository: repo,
        stt: const UnavailableSpeechToText(),
        tts: const UnavailableTextToSpeech(),
      )));
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byType(TextField).last, 'urgence : douleur thoracique');
      await tester.tap(find.byTooltip('Envoyer'));
      await tester.pumpAndSettle();

      expect(find.text('Urgence détectée'), findsOneWidget);
    });
  });
}
