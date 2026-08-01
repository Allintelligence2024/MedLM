// BackgroundSyncService — implémentation réelle du callback
// WorkManager. Cette classe est instanciée avec un `AppContainer`
// minimal (DB + API client + repos) et expose la méthode
// statique `handle(task, inputData)` appelée par `callbackDispatcher`.
//
// Stratégie :
//   1. Ouvre (ou ré-utilise) la base locale.
//   2. Construit un `RestSyncRepository` ad-hoc.
//   3. Appelle `pushPending()` puis `pullSince()`.
//   4. Renvoie `true` (succès) au WorkManager.
//
// Note : on évite de garder des références long-lived entre
// exécutions successives — chaque tâche est courte et stateless.
// C'est pourquoi `AppContainer` n'est pas réutilisé : on reconstruit
// ce dont on a besoin.
library;

import 'dart:async';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../data/local/app_database.dart';
import '../../data/network/api_client.dart';
import '../../data/network/secure_token_storage.dart';
import '../../data/repositories/ai/adaptive_params_cache.dart';
import '../../data/repositories/ai/ai_repository.dart';
import '../../data/repositories/rest_sync_repository.dart';
import '../container/app_container.dart' show AppContainer;
import 'background_sync.dart';

class BackgroundSyncService {
  /// Appelé par le callbackDispatcher (top-level, pas de DI).
  /// Retourne `true` en cas de succès, `false` pour signaler un
  /// échec (WorkManager retentera).
  static Future<bool> handle(String task, Map<String, dynamic>? inputData) async {
    // On ne fait rien si la tâche n'est pas la nôtre.
    if (task != kBackgroundSyncTaskName) return true;
    try {
      // Configuration par défaut — en prod, on lirait depuis
      // --dart-define=API_BASE_URL=...
      const apiBaseUrl = String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://10.0.2.2:3000',
      );

      final db = await _openDatabase();
      final storage = SecureTokenStorage();
      final api = ApiClient(baseUrl: apiBaseUrl, tokenStorage: storage);
      final sync = RestSyncRepository(api: api, db: db);
      try {
        final pushed = await sync.pushPending();
        final pulled = await sync.pullSince(0);

        // Poids FSRS adaptatifs (Phase 19.6) : refresh périodique si
        // le cache est périmé (> 6 h) — best-effort absolu, un échec
        // réseau ici ne DOIT PAS invalider la tâche de sync (le SRS
        // local continue sur les poids actuels).
        final cache = AdaptiveParamsCache(db: db);
        final existing = await cache.read();
        final nowMs = DateTime.now().millisecondsSinceEpoch;
        if (existing == null || cache.isStale(existing.fetchedAtMs, nowMs)) {
          await refreshAdaptiveFsrsParameters(
            ai: AiRepository(api: api),
            cache: cache,
            nowMs: nowMs,
          );
        }

        // On peut logger via print() — visible dans logcat (Android)
        // et os_log (iOS).
        // ignore: avoid_print
        print('BackgroundSync: pushed=$pushed pulled=$pulled');
        return true;
      } finally {
        await db.close();
      }
    } catch (e, st) {
      // ignore: avoid_print
      print('BackgroundSync failed: $e\n$st');
      return false;
    }
  }

  static Future<AppDatabase> _openDatabase() async {
    final dir = await getApplicationDocumentsDirectory();
    final dbFile = File(p.join(dir.path, 'medanki_dz.sqlite'));
    return AppDatabase(NativeDatabase.createInBackground(dbFile));
  }
}
