// BackgroundSync — planification de la synchronisation SRS en
// arrière-plan via `workmanager` (Android) / BackgroundTasks (iOS).
//
// Contraintes v2 §3 (boucle d'étude offline-first) :
//   * La sync doit pouvoir tourner sans interaction utilisateur.
//   * Périodicité cible : 15 min (cf. phase 8 — outbox flush).
//   * Conditions de déclenchement : WiFi (mieux pour les paquets
//     lourds) + batterie non-faible.
//
// Architecture :
//   * `BackgroundSync.initialize()` est appelé une fois au boot
//     de l'app (depuis `main.dart`). Il enregistre le callback.
//   * `BackgroundSync.schedule()` programme une tâche périodique.
//   * Le callback (top-level ou static) reçoit un `BackgroundTask`
//     et appelle `BackgroundSyncService.runOnce(...)`.
//
// Note importante : les callbacks WorkManager doivent être des
// fonctions **top-level** ou des méthodes statiques (pas de
// closure). C'est pour ça que `BackgroundSyncService` est exposé
// séparément, et que le callback est `static`.
library;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:workmanager/workmanager.dart';

import 'background_sync_service.dart';

/// Nom de la tâche périodique. Doit être unique dans l'app.
const String kBackgroundSyncTaskName = 'medanki_dz.background_sync';

class BackgroundSync {
  BackgroundSync._();

  static bool _initialized = false;

  /// À appeler une seule fois au démarrage de l'app (dans
  /// `main.dart` AVANT `runApp`). `callbackDispatcher` est la
  /// fonction top-level qui sera appelée en background.
  static void initialize({String? debugLabel}) {
    if (_initialized) return;
    Workmanager().initialize(
      callbackDispatcher,
      isInDebugMode: debugLabel != null,
    );
    _initialized = true;
  }

  /// Programme la sync périodique. Idempotent : reprogrammer avec
  /// la même fréquence ne crée pas de doublons.
  static Future<void> schedule({
    Duration frequency = const Duration(minutes: 15),
    bool requireWifi = true,
  }) async {
    if (!_initialized) {
      throw StateError(
        'BackgroundSync.initialize() doit être appelé avant schedule()',
      );
    }
    final conditions = <WorkmanagerConstraint>[];
    if (requireWifi) conditions.add(WorkmanagerConstraint.connected);
    await Workmanager().registerPeriodicTask(
      'periodic.$kBackgroundSyncTaskName',
      kBackgroundSyncTaskName,
      frequency: frequency,
      constraints: conditions,
      existingWorkPolicy: ExistingPeriodicWorkPolicy.replace,
    );
  }

  /// Annule toutes les tâches planifiées.
  static Future<void> cancel() async {
    if (!_initialized) return;
    await Workmanager().cancelByUniqueName('periodic.$kBackgroundSyncTaskName');
  }

  /// Synchronisation one-shot, déclenchée par exemple par un
  /// `pull-to-refresh` ou un retour de foreground.
  static Future<void> runOnce({bool requireWifi = false}) async {
    if (!_initialized) {
      throw StateError('BackgroundSync.initialize() doit être appelé avant runOnce()');
    }
    if (requireWifi) {
      final conn = await Connectivity().checkConnectivity();
      if (!conn.contains(ConnectivityResult.wifi)) return;
    }
    await Workmanager().registerOneOffTask(
      'oneshot.$kBackgroundSyncTaskName.${DateTime.now().millisecondsSinceEpoch}',
      kBackgroundSyncTaskName,
      existingWorkPolicy: ExistingWorkPolicy.replace,
    );
  }
}

/// Callback WorkManager — DOIT être top-level. Délègue au service
/// qui, lui, peut avoir des dépendances injectées.
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    return BackgroundSyncService.handle(task, inputData);
  });
}
