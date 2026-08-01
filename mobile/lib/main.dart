/// Point d'entrée de l'application MedAnki DZ (audit P0-2).
///
/// Ce fichier n'existait pas : `mobile/lib/` contenait 69 fichiers
/// formant une bibliothèque compilable, mais aucune application
/// lançable. Pas de `main()`, pas de routeur, pas de dossiers de
/// plateforme.
///
/// Séquence de démarrage, dans cet ordre et pour ces raisons :
///   1. `ensureInitialized()` — obligatoire avant tout appel de plugin ;
///   2. ouverture de la base locale — c'est la source de vérité hors
///      ligne, rien d'utile ne peut s'afficher sans elle ;
///   3. lecture de la version applicative (`package_info_plus`) — elle
///      est envoyée au backend avec le jeton d'appareil ;
///   4. enregistrement du worker de fond ;
///   5. `runApp` avec les providers surchargés.
///
/// Tout ce qui peut échouer sans empêcher de réviser (WorkManager,
/// notifications) est encapsulé : un plugin absent ne doit pas donner
/// un écran noir.
library;

import 'dart:async';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'app/app.dart';
import 'core/config/app_config.dart';
import 'core/di/providers.dart';
import 'core/sync/background_sync.dart';
import 'data/local/app_database.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final config = AppConfig.fromEnvironment();
  assert(
    config.isConsistent,
    'Build de production pointant sur une URL non-HTTPS ou locale : '
    '${config.apiBaseUrl}. Passer --dart-define=API_BASE_URL=https://…',
  );

  final database = await _openDatabase();
  final appVersion = await _readAppVersion();

  // Sync périodique. Un échec d'enregistrement (plugin indisponible,
  // restrictions constructeur — fréquentes sur Android DZ) ne doit pas
  // empêcher l'application de démarrer : la sync se fera au premier
  // plan.
  unawaited(_scheduleBackgroundSync());

  runApp(
    ProviderScope(
      overrides: [
        appConfigProvider.overrideWithValue(config),
        appDatabaseProvider.overrideWithValue(database),
        appVersionProvider.overrideWithValue(appVersion),
      ],
      child: const MedAnkiApp(),
    ),
  );
}

/// Ouvre la base SQLite dans le répertoire de documents.
///
/// `createInBackground` déporte les I/O sur un isolate : indispensable
/// pour ne pas bloquer la première frame sur un gros journal de
/// révisions.
Future<AppDatabase> _openDatabase() async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File(p.join(dir.path, 'medanki_dz.sqlite'));
  return AppDatabase(NativeDatabase.createInBackground(file));
}

/// Enregistre la tâche périodique de synchronisation.
Future<void> _scheduleBackgroundSync() async {
  try {
    BackgroundSync.initialize(debugLabel: kDebugMode ? 'medanki' : null);
    await BackgroundSync.schedule();
  } catch (e) {
    debugPrint('Sync de fond indisponible: $e');
  }
}

Future<String> _readAppVersion() async {
  try {
    final info = await PackageInfo.fromPlatform();
    return '${info.version}+${info.buildNumber}';
  } catch (_) {
    // Tests, ou plateforme sans PackageInfo : la version n'est qu'un
    // renseignement de télémétrie, jamais une condition de démarrage.
    return 'unknown';
  }
}
