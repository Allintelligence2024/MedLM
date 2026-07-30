// Exceptions API — traduction des codes HTTP en erreurs métier.
//
// On expose des exceptions typées plutôt que de manipuler des
// DioException dans tout le code. Côté UI, on catch et on affiche un
// message localisé.
library;

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.cause});
  final String message;
  final int? statusCode;
  final Object? cause;
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class NetworkException extends ApiException {
  const NetworkException(super.message, {super.cause}) : super(statusCode: null);
}

class AuthException extends ApiException {
  const AuthException(super.message, {super.statusCode = 401, super.cause});
}

class ServerException extends ApiException {
  const ServerException(super.message, {super.statusCode = 500, super.cause});
}

class ThrottleException extends ApiException {
  const ThrottleException(super.message, {super.statusCode = 429, super.cause});
}

class ValidationException extends ApiException {
  const ValidationException(super.message, {super.statusCode = 400, super.cause});
}
