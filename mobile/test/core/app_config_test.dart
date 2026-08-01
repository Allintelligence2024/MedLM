// Tests audit P0-2 — configuration de build.
//
// `isConsistent` existe pour attraper une erreur de release : un build
// `prod` qui pointe encore sur localhost ou sur du HTTP en clair. Sans
// ce garde-fou, l'APK partirait sur les stores en parlant à une
// machine de développement.
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/config/app_config.dart';

AppConfig _config(String url, AppFlavor flavor) => AppConfig(
      apiBaseUrl: url,
      flavor: flavor,
      enableCrashReporting: flavor == AppFlavor.prod,
    );

void main() {
  group('AppConfig.fromEnvironment', () {
    test('valeurs par défaut : dev sur l\'alias émulateur', () {
      final config = AppConfig.fromEnvironment();
      expect(config.flavor, AppFlavor.dev);
      expect(config.apiBaseUrl, 'http://10.0.2.2:3000');
      expect(config.isProd, isFalse);
      expect(config.enableCrashReporting, isFalse);
    });
  });

  group('isConsistent', () {
    test('dev et staging acceptent tout', () {
      for (final flavor in [AppFlavor.dev, AppFlavor.staging]) {
        expect(_config('http://localhost:3000', flavor).isConsistent, isTrue);
        expect(_config('http://10.0.2.2:3000', flavor).isConsistent, isTrue);
      }
    });

    test('prod accepte une URL HTTPS publique', () {
      expect(
        _config('https://api.medanki.dz', AppFlavor.prod).isConsistent,
        isTrue,
      );
    });

    test('prod refuse le HTTP en clair', () {
      expect(
        _config('http://api.medanki.dz', AppFlavor.prod).isConsistent,
        isFalse,
      );
    });

    test('prod refuse une adresse locale', () {
      for (final host in ['localhost', '127.0.0.1', '10.0.2.2', '0.0.0.0']) {
        expect(
          _config('https://$host:3000', AppFlavor.prod).isConsistent,
          isFalse,
          reason: '$host ne devrait pas passer en production',
        );
      }
    });

    test('prod refuse une URL sans schéma', () {
      expect(_config('api.medanki.dz', AppFlavor.prod).isConsistent, isFalse);
      expect(_config('', AppFlavor.prod).isConsistent, isFalse);
    });

    test('le crash reporting n\'est actif qu\'en production', () {
      expect(AppConfig.fromEnvironment().enableCrashReporting, isFalse);
      expect(
        _config('https://api.medanki.dz', AppFlavor.prod).enableCrashReporting,
        isTrue,
      );
    });
  });
}
