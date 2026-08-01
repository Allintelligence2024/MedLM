/// Widget racine — thème, localisation, routeur.
library;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/di/providers.dart';
import '../core/settings/app_settings.dart';
import '../l10n/app_localizations.dart';
import 'router.dart';
import 'theme.dart';

class MedAnkiApp extends ConsumerWidget {
  const MedAnkiApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final settings = ref.watch(settingsProvider).valueOrNull;

    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      routerConfig: router,
      // La langue choisie par l'utilisateur prime ; sinon on suit le
      // système, et `supportedLocales` fait la résolution (arabe pour
      // un téléphone en arabe, français par défaut en Algérie).
      locale: settings?.language.locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      builder: (context, child) {
        // Un facteur de texte système extrême casserait les écrans de
        // révision (question + 4 boutons de notation doivent tenir).
        // On borne sans jamais empêcher l'agrandissement utile.
        final media = MediaQuery.of(context);
        return MediaQuery(
          data: media.copyWith(
            textScaler: media.textScaler.clamp(
              minScaleFactor: 0.8,
              maxScaleFactor: 1.6,
            ),
          ),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
