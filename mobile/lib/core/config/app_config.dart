/// Configuration d'exécution — résolue au build, jamais au runtime.
///
/// Tout passe par `--dart-define` : aucune URL ni clé n'est écrite en
/// dur dans le code, et rien n'est lu depuis un fichier embarqué (un
/// `.env` dans les assets serait lisible en décompilant l'APK).
///
/// Exemple :
///   flutter run --dart-define=API_BASE_URL=https://api.medanki.dz
library;

import 'package:flutter/foundation.dart';

/// Environnement de déploiement — pilote les valeurs par défaut.
enum AppFlavor { dev, staging, prod }

@immutable
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.flavor,
    required this.enableCrashReporting,
  });

  /// Construit la configuration à partir des `--dart-define`.
  ///
  /// La valeur par défaut `10.0.2.2` est l'alias de `localhost` vu
  /// depuis l'émulateur Android — c'est déjà la convention retenue par
  /// `BackgroundSyncService`, on la garde pour rester cohérent.
  factory AppConfig.fromEnvironment() {
    const flavorName = String.fromEnvironment('FLAVOR', defaultValue: 'dev');
    final flavor = switch (flavorName) {
      'prod' => AppFlavor.prod,
      'staging' => AppFlavor.staging,
      _ => AppFlavor.dev,
    };
    const baseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://10.0.2.2:3000',
    );
    return AppConfig(
      apiBaseUrl: baseUrl,
      flavor: flavor,
      enableCrashReporting: flavor == AppFlavor.prod,
    );
  }

  final String apiBaseUrl;
  final AppFlavor flavor;
  final bool enableCrashReporting;

  bool get isProd => flavor == AppFlavor.prod;

  /// Vrai si la configuration est utilisable en production.
  ///
  /// Un build `prod` qui pointe encore sur localhost est une erreur de
  /// release, pas un cas limite : on veut le détecter au démarrage.
  bool get isConsistent {
    if (!isProd) return true;
    final uri = Uri.tryParse(apiBaseUrl);
    if (uri == null || !uri.hasScheme) return false;
    if (uri.scheme != 'https') return false;
    const localHosts = {'localhost', '127.0.0.1', '10.0.2.2', '0.0.0.0'};
    return !localHosts.contains(uri.host);
  }
}
