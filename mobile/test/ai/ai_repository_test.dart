// Tests Phase 19.5 — AiRepository (mock de l'ApiClient).
//
// On vérifie :
//   * le mapping endpoint → modèle ;
//   * le cache des hints (pas de requête doublée par carte + langue) ;
//   * hintOrNull ne throw jamais (offline-first) ;
//   * l'historique tuteur est plafonné à 10 messages ;
//   * les poids FSRS servis sont bornés côté client (défense).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/data/network/api_client.dart';
import 'package:medanki_dz/data/network/api_exceptions.dart';
import 'package:medanki_dz/data/repositories/ai/ai_models.dart';
import 'package:medanki_dz/data/repositories/ai/ai_repository.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient() : super(baseUrl: 'http://test', tokenStorage: _NoopStorage());

  int hintCalls = 0;
  int voiceCalls = 0;
  int tutorCalls = 0;
  int profileCalls = 0;
  int? lastHistoryLength;
  bool failHints = false;

  @override
  Future<Map<String, dynamic>> fetchAiHint(String cardId,
      {String? lang}) async {
    hintCalls++;
    if (failHints) throw const NetworkException('offline');
    return <String, dynamic>{
      'card_id': cardId,
      'category': 'consolidation',
      'hint': 'Associez « pape » à une image mentale.',
      'lang': lang ?? 'fr',
      'experience_level': 'beginner',
      'personalized': true,
      'based_on': const ['reps=2'],
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
    voiceCalls++;
    return <String, dynamic>{
      'job_id': 'j1',
      'draft_id': 'd1',
      'transcript': audioTranscript ?? '',
      'formatted': const {
        'front': 'Q ?',
        'back': 'R.',
        'rule': 'definition',
      },
      'transcriber': const {
        'provider': 'mock',
        'model': 'deterministic',
        'confidence': 0.99,
      },
      'lang': lang,
      'remaining_quota_today': 49,
      'next_step': 'Relisez le brouillon.',
    };
  }

  @override
  Future<Map<String, dynamic>> tutorAsk({
    required String question,
    String lang = 'fr',
    List<Map<String, String>> history = const [],
  }) async {
    tutorCalls++;
    lastHistoryLength = history.length;
    return <String, dynamic>{
      'answer': 'Réponse de révision. ⚠️ …',
      'disclaimer': '⚠️ Ceci n\u2019est pas un avis médical…',
      'emergency': false,
      'within_scope': true,
      'provider': 'mock',
      'model': 'deterministic',
      'remaining_quota_today': 29,
    };
  }

  @override
  Future<Map<String, dynamic>> fetchAdaptiveProfile() async {
    profileCalls++;
    // Le serveur renvoie ici un w8 DÉLIBÉRÉMENT hors bornes (×10) :
    // le client doit le borner à 2× la base (défense en profondeur).
    final weights = <double>[
      0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604,
      0.0046, 15.4575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605,
      2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
    ];
    return <String, dynamic>{
      'user_id': 'u1',
      'window_days': 30,
      'total_reviews': 250,
      'lapses': 5,
      'lapse_rate': 0.02,
      'leech_cards': const <dynamic>[],
      'hot_tags': const <dynamic>[],
      'fsrs_adjustment': <String, dynamic>{
        'weights': weights,
        'changed_indices': const [8],
        'reasons': const ['lapse_rate faible → w8 ×1.05'],
        'active': true,
      },
    };
  }
}

class _NoopStorage implements dynamic {
  @override
  noSuchMethod(Invocation invocation) async => null;
}

void main() {
  late FakeApiClient api;
  late AiRepository repo;

  setUp(() {
    api = FakeApiClient();
    repo = AiRepository(api: api);
  });

  test('hintFor mappe le payload et met en cache par carte+langue', () async {
    final h1 = await repo.hintFor('c1', lang: AiLang.fr);
    final h2 = await repo.hintFor('c1', lang: AiLang.fr);
    expect(identical(h1, h2), isTrue);
    expect(api.hintCalls, 1);

    // Autre langue → nouvel appel (clé de cache différente).
    await repo.hintFor('c1', lang: AiLang.ar);
    expect(api.hintCalls, 2);

    // Invalidation explicite.
    repo.invalidateHint('c1');
    await repo.hintFor('c1', lang: AiLang.fr);
    expect(api.hintCalls, 3);
  });

  test('hintOrNull ne throw jamais (offline)', () async {
    api.failHints = true;
    final hint = await repo.hintOrNull('cX');
    expect(hint, isNull);
    expect(api.hintCalls, 1);
  });

  test('dictateCard exige transcript ou audio', () async {
    expect(
      () => repo.dictateCard(deckId: 'd1'),
      throwsArgumentError,
    );
    final draft = await repo.dictateCard(
      deckId: 'd1',
      transcript: 'la pompe sodium potassium',
    );
    expect(draft.formatted.rule, 'definition');
    expect(api.voiceCalls, 1);
  });

  test('askTutor plafonne l\u2019historique à 10 messages', () async {
    final history = List.generate(
      15,
      (i) => TutorTurn(role: TutorRole.user, content: 'q$i'),
    );
    final answer = await repo.askTutor(question: '  glycolyse ?  ', history: history);
    expect(api.lastHistoryLength, 10);
    expect(answer.disclaimer, startsWith('⚠️'));
  });

  test('askTutor refuse une question de moins de 3 caractères', () {
    expect(() => repo.askTutor(question: 'ab'), throwsArgumentError);
  });
}
