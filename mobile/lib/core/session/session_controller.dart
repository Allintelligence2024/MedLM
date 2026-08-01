/// Session utilisateur — source de vérité de « qui est connecté ».
///
/// Le stockage réel des jetons reste `SecureTokenStorage` (Keychain /
/// EncryptedSharedPreferences) : ce contrôleur n'en garde qu'un reflet
/// en mémoire pour que le routeur et l'UI puissent réagir sans faire
/// d'I/O à chaque rebuild. Aucun token n'est exposé dans l'état.
///
/// Le refresh reste géré par `AuthInterceptor` côté Dio : on ne
/// duplique pas cette logique ici. Ce contrôleur ne fait que
/// *constater* l'état d'authentification.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../di/providers.dart';

enum SessionStatus {
  /// Au démarrage, tant qu'on n'a pas relu le stockage sécurisé.
  unknown,
  authenticated,
  anonymous,
}

@immutable
class SessionState {
  const SessionState({
    required this.status,
    this.userId,
    this.email,
  });

  const SessionState.unknown() : this(status: SessionStatus.unknown);
  const SessionState.anonymous() : this(status: SessionStatus.anonymous);

  final SessionStatus status;
  final String? userId;
  final String? email;

  bool get isAuthenticated => status == SessionStatus.authenticated;
  bool get isResolved => status != SessionStatus.unknown;

  @override
  bool operator ==(Object other) =>
      other is SessionState &&
      other.status == status &&
      other.userId == userId &&
      other.email == email;

  @override
  int get hashCode => Object.hash(status, userId, email);
}

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    // La relecture du stockage sécurisé est asynchrone : on part de
    // `unknown` et le routeur affiche l'écran de démarrage jusqu'à
    // résolution. Ne jamais partir de `anonymous`, sinon un
    // utilisateur déjà connecté voit l'écran de login clignoter.
    Future<void>.microtask(restore);
    return const SessionState.unknown();
  }

  /// Relit le stockage sécurisé et en déduit l'état.
  Future<void> restore() async {
    final storage = ref.read(tokenStorageProvider);
    try {
      final userId = await storage.readUserId();
      final refresh = await storage.readRefreshToken();
      // Un userId sans refresh token n'est pas une session utilisable :
      // l'access token seul expire en 15 min et ne se renouvelle pas.
      if (userId != null && userId.isNotEmpty && refresh != null && refresh.isNotEmpty) {
        state = SessionState(status: SessionStatus.authenticated, userId: userId);
      } else {
        state = const SessionState.anonymous();
      }
    } catch (_) {
      // Keychain indisponible (device verrouillé au boot, par ex.) :
      // on ne bloque pas l'app sur un écran de démarrage infini.
      state = const SessionState.anonymous();
    }
  }

  /// Enregistre les jetons d'une authentification réussie.
  Future<void> signIn({
    required String accessToken,
    required String refreshToken,
    required String userId,
    String? email,
  }) async {
    final storage = ref.read(tokenStorageProvider);
    await storage.writeAccessToken(accessToken);
    await storage.writeRefreshToken(refreshToken);
    await storage.writeUserId(userId);
    state = SessionState(
      status: SessionStatus.authenticated,
      userId: userId,
      email: email,
    );
  }

  /// Déconnexion. Les révisions non synchronisées sont poussées
  /// d'abord — les perdre serait perdre du travail réel de
  /// l'utilisateur ; un échec réseau ne doit pas pour autant bloquer
  /// la déconnexion.
  Future<void> signOut({bool flushOutbox = true}) async {
    final userId = state.userId;
    if (flushOutbox && userId != null) {
      try {
        final deviceId =
            await ref.read(tokenStorageProvider).getOrCreateDeviceId();
        await ref.read(syncOutboxProvider).call(
              userId: userId,
              deviceId: deviceId,
              nowMs: DateTime.now().millisecondsSinceEpoch,
            );
      } catch (_) {
        // Hors ligne : les événements restent dans l'outbox local,
        // ils partiront à la prochaine connexion du même compte.
      }
    }
    await ref.read(tokenStorageProvider).clear();
    state = const SessionState.anonymous();
  }
}
