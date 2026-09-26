/// Widget racine — thème, localisation, routeur.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/di/providers.dart';
import '../l10n/app_localizations.dart';
import 'router.dart';
import 'theme.dart';

/// Langue effectivement servie à partir des langues demandées par le
/// système et de celles du produit.
///
/// Le français est le repli du produit (langue de rédaction, public
/// algérien) : le résultat ne doit donc PAS dépendre de l'ordre de
/// `AppLocalizations.supportedLocales`, qui est produit par le
/// générateur Flutter (aujourd'hui `ar`, `en`, `fr`). Sans cette
/// fonction, un téléphone dans une langue non supportée tombait sur
/// la première langue du bundle généré — c'est-à-dire l'arabe.
Locale resolveAppLocale(List<Locale>? preferred, Iterable<Locale> supported) {
  final supportedList = supported.toList(growable: false);
  for (final wanted in preferred ?? const <Locale>[]) {
    for (final candidate in supportedList) {
      if (candidate.languageCode == wanted.languageCode) return candidate;
    }
  }
  return const Locale('fr');
}

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
      // système, et `resolveAppLocale` garantit le repli français
      // (l'ordre du bundle généré n'est pas un contrat produit).
      locale: settings?.language.locale,
      localeListResolutionCallback: resolveAppLocale,
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
