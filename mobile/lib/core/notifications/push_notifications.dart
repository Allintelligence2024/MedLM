/// Notifications push — côté mobile (audit P1-3).
///
/// Avant ce lot, la chaîne était coupée aux deux bouts : aucun package
/// FCM dans `pubspec.yaml`, aucune remontée de jeton vers le backend,
/// aucun écran de permission. Le backend savait envoyer, personne ne
/// pouvait recevoir.
///
/// Ce service fait trois choses, et rien d'autre :
///   1. demander la permission (au bon moment, pas au premier lancement) ;
///   2. remonter le jeton d'appareil au backend, et le re-remonter à
///      chaque rotation (`onTokenRefresh`) ;
///   3. transformer une notification ouverte en deep link applicatif.
///
/// Il est volontairement tolérant : sur un device sans Google Play
/// Services (fréquent en Algérie sur certains modèles), l'initialisation
/// échoue proprement et l'application continue de fonctionner — les
/// notifications sont un confort, pas une dépendance du produit.
library;

import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../data/network/api_client.dart';

/// Destination d'un deep link porté par une notification.
@immutable
class PushDeepLink {
  const PushDeepLink(this.location);

  /// Chemin go_router (ex. `/study`, `/exams`).
  final String location;

  @override
  bool operator ==(Object other) =>
      other is PushDeepLink && other.location == location;

  @override
  int get hashCode => location.hashCode;
}

/// Traduit le `kind` envoyé par le backend en route applicative.
///
/// Fonction pure : c'est la table de correspondance qui compte, elle
/// est testée sans Firebase (cf. test/core/push_notifications_test.dart).
/// Les `kind` proviennent de `backend/src/notifications/push.types.ts`.
PushDeepLink? deepLinkFor(Map<String, dynamic> data) {
  final explicit = data['deeplink'];
  if (explicit is String && explicit.startsWith('/') && explicit.length > 1) {
    return PushDeepLink(explicit);
  }
  return switch (data['kind']) {
    // Toutes les alertes de révision mènent à la session d'étude :
    // c'est l'action que l'utilisateur veut accomplir, pas une page
    // d'information sur laquelle il devrait encore cliquer.
    'due_reminder' => const PushDeepLink('/study'),
    'streak_danger' => const PushDeepLink('/study'),
    'retention_alert' => const PushDeepLink('/study'),
    'deck_updated' => const PushDeepLink('/decks'),
    _ => null,
  };
}

/// État de la permission, tel qu'exposé à l'UI.
enum PushPermission { granted, denied, provisional, unknown }

class PushNotificationsService {
  PushNotificationsService({
    required ApiClient api,
    FirebaseMessaging? messaging,
  })  : _api = api,
        _messaging = messaging;

  final ApiClient _api;
  FirebaseMessaging? _messaging;

  final StreamController<PushDeepLink> _deepLinks =
      StreamController<PushDeepLink>.broadcast();
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _openedSub;
  bool _initialized = false;

  /// Deep links issus d'une notification ouverte par l'utilisateur.
  Stream<PushDeepLink> get deepLinks => _deepLinks.stream;

  FirebaseMessaging get _fm => _messaging ??= FirebaseMessaging.instance;

  /// Démarre l'écoute. À appeler une fois la session authentifiée :
  /// enregistrer un jeton sans utilisateur n'a pas de destinataire.
  ///
  /// Ne demande PAS la permission — c'est le rôle de
  /// [requestPermission], déclenché depuis l'écran dédié.
  Future<void> initialize({
    required String appVersion,
    required String locale,
  }) async {
    if (_initialized) return;
    _initialized = true;
    try {
      await _registerCurrentToken(appVersion: appVersion, locale: locale);

      // Rotation du jeton : FCM peut le changer à tout moment (restore
      // de sauvegarde, réinstallation, purge). Sans ce réabonnement,
      // l'appareil devient silencieusement injoignable.
      _tokenRefreshSub = _fm.onTokenRefresh.listen((token) {
        unawaited(
          _sendToken(token: token, appVersion: appVersion, locale: locale)
              .catchError((_) {}),
        );
      });

      _openedSub = FirebaseMessaging.onMessageOpenedApp.listen((message) {
        final link = deepLinkFor(message.data);
        if (link != null) _deepLinks.add(link);
      });

      // Application démarrée DEPUIS une notification (état terminé).
      final initial = await _fm.getInitialMessage();
      if (initial != null) {
        final link = deepLinkFor(initial.data);
        if (link != null) _deepLinks.add(link);
      }
    } catch (e) {
      // Pas de Google Play Services, Firebase non configuré en dev,
      // device restreint… : l'app continue sans notifications.
      debugPrint('Notifications indisponibles: $e');
    }
  }

  /// Demande la permission système. Retourne l'état résultant.
  Future<PushPermission> requestPermission() async {
    try {
      final settings = await _fm.requestPermission();
      return switch (settings.authorizationStatus) {
        AuthorizationStatus.authorized => PushPermission.granted,
        AuthorizationStatus.provisional => PushPermission.provisional,
        AuthorizationStatus.denied => PushPermission.denied,
        _ => PushPermission.unknown,
      };
    } catch (_) {
      return PushPermission.unknown;
    }
  }

  /// État courant de la permission, sans rien demander.
  Future<PushPermission> currentPermission() async {
    try {
      final settings = await _fm.getNotificationSettings();
      return switch (settings.authorizationStatus) {
        AuthorizationStatus.authorized => PushPermission.granted,
        AuthorizationStatus.provisional => PushPermission.provisional,
        AuthorizationStatus.denied => PushPermission.denied,
        _ => PushPermission.unknown,
      };
    } catch (_) {
      return PushPermission.unknown;
    }
  }

  /// Retire l'appareil du registre (déconnexion, refus de consentement).
  Future<void> unregister() async {
    try {
      await _api.unregisterDeviceToken();
      await _fm.deleteToken();
    } catch (_) {
      // Hors ligne : le backend désactivera le jeton au premier
      // UNREGISTERED renvoyé par FCM.
    }
  }

  Future<void> _registerCurrentToken({
    required String appVersion,
    required String locale,
  }) async {
    final token = await _fm.getToken();
    if (token == null || token.isEmpty) return;
    await _sendToken(token: token, appVersion: appVersion, locale: locale);
  }

  Future<void> _sendToken({
    required String token,
    required String appVersion,
    required String locale,
  }) async {
    await _api.registerDeviceToken(
      token: token,
      platform: defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
      appVersion: appVersion,
      locale: locale,
    );
  }

  void dispose() {
    unawaited(_tokenRefreshSub?.cancel());
    unawaited(_openedSub?.cancel());
    unawaited(_deepLinks.close());
  }
}
