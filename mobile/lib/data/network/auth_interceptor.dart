// AuthInterceptor — injecte le JWT d'accès sur chaque requête sortante.
//
// Comportement :
//   * Lecture du token depuis `SecureTokenStorage` (lu à chaque
//     requête pour gérer l'expiration transparente) ;
//   * Si 401 : tente UN refresh via `/v1/auth/refresh` puis réessaie
//     la requête ; si le refresh échoue, lève AuthException.
//
// Le refresh token n'est jamais loggué ni sérialisé en clair sur disque
// (utilise flutter_secure_storage -> Android Keystore / iOS Keychain).
library;

import 'package:dio/dio.dart';

import 'api_exceptions.dart';
import 'secure_token_storage.dart';

class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this.storage, required this.baseUrl});
  final SecureTokenStorage storage;
  final String baseUrl;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // Ne pas attacher de token aux endpoints d'auth eux-mêmes.
    final path = options.path;
    if (path.startsWith('/v1/auth/signup') ||
        path.startsWith('/v1/auth/login') ||
        path.startsWith('/v1/auth/magic-link') ||
        path.startsWith('/v1/auth/refresh')) {
      return handler.next(options);
    }
    final access = await storage.readAccessToken();
    if (access != null) {
      options.headers['Authorization'] = 'Bearer $access';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final response = err.response;
    if (response?.statusCode != 401) {
      return handler.next(err);
    }
    // Refresh une fois.
    final refresh = await storage.readRefreshToken();
    if (refresh == null) {
      return handler.next(err);
    }
    try {
      final refreshed = await _refresh(refresh);
      await storage.writeAccessToken(refreshed.accessToken);
      await storage.writeRefreshToken(refreshed.refreshToken);
      // Réessaye la requête originale.
      final req = err.requestOptions;
      req.headers['Authorization'] = 'Bearer ${refreshed.accessToken}';
      final retried = await Dio().fetch<dynamic>(req);
      return handler.resolve(retried);
    } catch (_) {
      // Refresh impossible : on propage l'auth error.
      await storage.clear();
      return handler.next(
        DioException(
          requestOptions: err.requestOptions,
          response: err.response,
          type: DioExceptionType.badResponse,
          error: const AuthException('session expirée, reconnectez-vous'),
        ),
      );
    }
  }

  Future<({String accessToken, String refreshToken})> _refresh(String refresh) async {
    final dio = Dio();
    final res = await dio.post<dynamic>(
      '$baseUrl/v1/auth/refresh',
      data: {'refresh_token': refresh},
    );
    final data = res.data as Map<String, dynamic>;
    return (
      accessToken: data['access_token'] as String,
      refreshToken: data['refresh_token'] as String,
    );
  }
}
