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
