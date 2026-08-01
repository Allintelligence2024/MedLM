// ApiClient — Dio + intercepteurs.
//
// Configuration :
//   * baseUrl : passée à la construction
//   * 30s timeout connect / receive
//   * AuthInterceptor (injection JWT + refresh)
//   * Erreurs Dio → ApiException (cf. api_exceptions.dart)
//
// On n'utilise **pas** de singleton global : le client est construit
// par `AppContainer` et passé partout. Cela simplifie les tests (on
// peut injecter un mock) et le cycle de vie (clear() sur logout).
library;

import 'package:dio/dio.dart';

import '../../domain/domain.dart';
import 'api_exceptions.dart';
import 'auth_interceptor.dart';
import 'secure_token_storage.dart';

class ApiClient {
  ApiClient({
    required this.baseUrl,
    required SecureTokenStorage tokenStorage,
  }) : _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(seconds: 30),
          contentType: Headers.jsonContentType,
          responseType: ResponseType.json,
        )) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Ajoute X-Device-Id systématiquement pour les endpoints
          // qui en ont besoin (sync, entitlement).
          if (options.headers['X-Device-Id'] == null) {
            final id = await tokenStorage.getOrCreateDeviceId();
            options.headers['X-Device-Id'] = id;
          }
          handler.next(options);
        },
      ),
    );
    _dio.interceptors.add(
      AuthInterceptor(storage: tokenStorage, baseUrl: baseUrl),
    );
  }

  final String baseUrl;
  final Dio _dio;
  Dio get raw => _dio; // pour tests/debug

  // ── Endpoints utilisés par les repositories ────────────────────────

  /// POST /v1/srs-sync/push — batch de 100 events max.
  Future<Map<String, dynamic>> pushSyncEvents(
    String userId,
    List<ReviewEvent> events,
  ) async {
    if (events.length > 100) {
      throw const ValidationException('batch > 100 événements');
    }
    try {
      final res = await _dio.post<dynamic>(
        '/v1/srs-sync/push',
        data: {
          'events': events.map((e) => e.toJson()).toList(),
        },
      );
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// GET /v1/srs-sync/pull?since_ms=&limit=.
  Future<Map<String, dynamic>> pullSyncEvents(
    String userId, {
    required int sinceMs,
    int limit = 200,
  }) async {
    try {
      final res = await _dio.get<dynamic>(
        '/v1/srs-sync/pull',
        queryParameters: {'since_ms': sinceMs, 'limit': limit},
      );
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// GET /v1/billing/entitlement — état actuel.
  Future<Map<String, dynamic>> fetchEntitlement(String userId) async {
    try {
      final res = await _dio.get<dynamic>('/v1/billing/entitlement');
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// GET /v1/entitlement/jwt — JWT signé pour usage offline.
  Future<String> fetchEntitlementJwt(String userId) async {
    try {
      final res = await _dio.get<dynamic>('/v1/entitlement/jwt');
      return (res.data as Map)['jwt'] as String;
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// POST /v1/auth/refresh — rotation du refresh token.
  Future<({String accessToken, String refreshToken, String userId})>
      refresh(String refreshToken) async {
    try {
      final res = await _dio.post<dynamic>(
        '/v1/auth/refresh',
        data: {'refresh_token': refreshToken},
      );
      final data = res.data as Map;
      return (
        accessToken: data['access_token'] as String,
        refreshToken: data['refresh_token'] as String,
        userId: data['user_id'] as String,
      );
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  // ── Auth basique (Phase 8 : on en a besoin pour la 1ère session) ───

  Future<({String accessToken, String refreshToken, String userId})>
      loginWithEmail({required String email}) async {
    try {
      final res = await _dio.post<dynamic>(
        '/v1/auth/login',
        data: {'email': email},
        options: Options(headers: {'X-Platform': 'mobile'}),
      );
      final data = res.data as Map;
      return (
        accessToken: data['access_token'] as String,
        refreshToken: data['refresh_token'] as String,
        userId: data['user_id'] as String,
      );
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  Future<({String accessToken, String refreshToken, String userId})>
      signupWithEmail({
    required String email,
    String? displayName,
    String? faculty,
    int? studyYear,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/v1/auth/signup',
        data: {
          'email': email,
          if (displayName != null) 'display_name': displayName,
          if (faculty != null) 'faculty': faculty,
          if (studyYear != null) 'study_year': studyYear,
        },
        options: Options(headers: {'X-Platform': 'mobile'}),
      );
      final data = res.data as Map;
      return (
        accessToken: data['access_token'] as String,
        refreshToken: data['refresh_token'] as String,
        userId: data['user_id'] as String,
      );
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  // ── Gamification (Phase 9 bis) ──────────────────────────────────

  /// GET /v1/gamification/leaderboard — top N de la semaine.
  Future<Map<String, dynamic>> leaderboardTop({
    String? faculty,
    int? studyYear,
    int limit = 50,
  }) async {
    final params = <String, dynamic>{'limit': limit};
    if (faculty != null) params['faculty'] = faculty;
    if (studyYear != null) params['study_year'] = studyYear;
    try {
      final res = await _dio.get<dynamic>(
        '/v1/gamification/leaderboard',
        queryParameters: params,
      );
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// GET /v1/gamification/leaderboard/me — état d'opt-in.
  Future<Map<String, dynamic>> leaderboardMe() async {
    try {
      final res = await _dio.get<dynamic>('/v1/gamification/leaderboard/me');
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// POST /v1/gamification/leaderboard/opt-in.
  Future<void> leaderboardOptIn({
    required String pseudonym,
    String? faculty,
    int? studyYear,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/v1/gamification/leaderboard/opt-in',
        data: {
          'pseudonym': pseudonym,
          if (faculty != null) 'faculty': faculty,
          if (studyYear != null) 'study_year': studyYear,
        },
      );
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// DELETE /v1/gamification/leaderboard/opt-in.
  Future<void> leaderboardOptOut() async {
    try {
      await _dio.delete<dynamic>('/v1/gamification/leaderboard/opt-in');
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  // ── Badges (Phase 9 bis) ────────────────────────────────────────

  /// GET /v1/gamification/badges — badges débloqués par l'utilisateur.
  Future<List<Map<String, dynamic>>> badgesUnlocked() async {
    try {
      final res = await _dio.get<dynamic>('/v1/gamification/badges');
      final items = (res.data as Map)['items'] as List;
      return items.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  // ── Stats (Phase 15.2) ───────────────────────────────────────

  /// GET /v1/stats/me — statistiques utilisateur.
  Future<Map<String, dynamic>> fetchStats({String period = 'all'}) async {
    try {
      final res = await _dio.get<dynamic>(
        '/v1/stats/me',
        queryParameters: {'period': period},
      );
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  // ── Examens (Phase 10 bis) ─────────────────────────────────────

  /// GET /v1/decks/:id/wrap-key — récupère la clé AES wrappée.
  Future<Map<String, dynamic>> wrapDeckKey({
    required String deckId,
    required String clientPublicKeyPem,
    required String deviceId,
  }) async {
    try {
      final res = await _dio.get<dynamic>(
        '/v1/decks/$deckId/wrap-key',
        queryParameters: {
          'client_public_key': clientPublicKeyPem,
          'device_id': deviceId,
        },
      );
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// DELETE /v1/decks/:id/wrap-key — révoque la clé d'un device.
  Future<void> revokeDeckKey({
    required String deckId,
    required String deviceId,
  }) async {
    try {
      await _dio.delete<dynamic>(
        '/v1/decks/$deckId/wrap-key',
        queryParameters: {'device_id': deviceId},
      );
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// POST /v1/exams/templates/:id/generate — génère une tentative
  /// à partir d'un template.
  Future<Map<String, dynamic>> generateExam(String templateId) async {
    try {
      final res = await _dio.post<dynamic>('/v1/exams/templates/$templateId/generate');
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// POST /v1/exams/attempts/:id/events — log d'un événement
  /// anti-triche.
  Future<void> recordExamEvent({
    required String attemptId,
    required String kind,
    required Map<String, Object?> metadata,
    required int clientTs,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/v1/exams/attempts/$attemptId/events',
        data: {
          'kind': kind,
          'metadata': metadata,
          'client_ts': clientTs,
        },
      );
    } on DioException catch (_) {
      // Cf. AntiCheatController.record — l'échec du log ne doit
      // jamais bloquer l'examen. Le caller catch déjà en amont.
      rethrow;
    }
  }

  // ── IA (Phase 19.5) ─────────────────────────────────────────────
  //
  // Tous les endpoints IA sont *provider-agnostic* côté serveur : le
  // mobile ne voit jamais de clé API ni de choix de fournisseur.

  /// GET /v1/ai/hints/:cardId — hint adaptatif (règles SRS, sans LLM).
  Future<Map<String, dynamic>> fetchAiHint(String cardId, {String? lang}) async {
    try {
      final res = await _dio.get<dynamic>(
        '/v1/ai/hints/$cardId',
        queryParameters: {if (lang != null) 'lang': lang},
      );
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// POST /v1/ai/voice-to-card — dictée → brouillon de carte.
  ///
  /// Chemin préféré : [audioTranscript] (STT côté client, pas d'upload
  /// audio). [audioBase64] n'est envoyé que si le STT natif est absent.
  Future<Map<String, dynamic>> voiceToCard({
    required String deckId,
    String lang = 'fr',
    String? audioTranscript,
    String? audioBase64,
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/v1/ai/voice-to-card',
        data: {
          'deck_id': deckId,
          'lang': lang,
          if (audioTranscript != null) 'audio_transcript': audioTranscript,
          if (audioBase64 != null) 'audio_base64': audioBase64,
        },
      );
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// POST /v1/ai/tutor/ask — question au tuteur (disclaimer déjà dans
  /// le texte servi ; l'historique est plafonné à 10 messages).
  Future<Map<String, dynamic>> tutorAsk({
    required String question,
    String lang = 'fr',
    List<Map<String, String>> history = const [],
  }) async {
    try {
      final res = await _dio.post<dynamic>(
        '/v1/ai/tutor/ask',
        data: {
          'question': question,
          'lang': lang,
          'history': history,
        },
      );
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// GET /v1/ai/adaptive/profile — profil d'erreur + poids FSRS ajustés.
  Future<Map<String, dynamic>> fetchAdaptiveProfile() async {
    try {
      final res = await _dio.get<dynamic>('/v1/ai/adaptive/profile');
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  // ── ML locale (Phase 20.3) ──────────────────────────────────────
  //
  // Calculs 100 % serveur sur agrégats déjà en base — jamais de service
  // ML externe, jamais de données qui sortent. Réponses explicables
  // (features + raisons rendues, v2 §13).

  /// GET /v1/ml/mock-exam-prediction — prédiction du score au prochain
  /// examen blanc (ou refus k-anonymat documenté, predictible=false).
  Future<Map<String, dynamic>> fetchMockExamPrediction() async {
    try {
      final res =
          await _dio.get<dynamic>('/v1/ml/mock-exam-prediction');
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// GET /v1/ml/tag-focus — suggestions focus/relax par tag.
  Future<Map<String, dynamic>> fetchTagFocus() async {
    try {
      final res = await _dio.get<dynamic>('/v1/ml/tag-focus');
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// GET /v1/exams/templates — templates actifs.
  Future<List<Map<String, dynamic>>> listExamTemplates({
    String? moduleId,
    String? faculty,
    int? studyYear,
  }) async {
    final params = <String, dynamic>{};
    if (moduleId != null) params['module_id'] = moduleId;
    if (faculty != null) params['faculty'] = faculty;
    if (studyYear != null) params['study_year'] = studyYear;
    try {
      final res = await _dio.get<dynamic>(
        '/v1/exams/templates',
        queryParameters: params,
      );
      return (res.data as List).cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  ApiException _translate(DioException e) {
    final code = e.response?.statusCode;
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.connectionError) {
      return NetworkException('pas de réseau', cause: e);
    }
    if (code == 401) return AuthException('non authentifié', cause: e);
    if (code == 429) return ThrottleException('trop de requêtes', cause: e);
    if (code != null && code >= 400 && code < 500) {
      return ValidationException('requête invalide (HTTP $code)', cause: e);
    }
    if (code != null && code >= 500) {
      return ServerException('erreur serveur (HTTP $code)', cause: e);
    }
    return ServerException('erreur inconnue', cause: e);
  }
}
