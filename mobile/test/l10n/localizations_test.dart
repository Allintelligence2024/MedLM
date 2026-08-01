// Tests audit P1-4 — internationalisation.
//
// La migration des 7 écrans historiques est terminée : plus aucune
// chaîne française en dur dans `lib/ui/`. Ces tests verrouillent le
// résultat côté exécution (le garde `check_mobile_i18n.py` le fait
// côté source).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/l10n/app_localizations.dart';

/// Monte un widget qui capture l'instance de localisation résolue.
Future<AppLocalizations> _localizationsFor(
  WidgetTester tester,
  Locale locale,
) async {
  late AppLocalizations captured;
  await tester.pumpWidget(
    MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Builder(
        builder: (context) {
          captured = AppLocalizations.of(context);
          return const SizedBox.shrink();
        },
      ),
    ),
  );
  await tester.pumpAndSettle();
  return captured;
}

void main() {
  testWidgets('les trois langues du produit sont déclarées', (tester) async {
    expect(
      AppLocalizations.supportedLocales.map((l) => l.languageCode).toList(),
      ['fr', 'ar', 'en'],
    );
  });

  testWidgets('français — langue de rédaction', (tester) async {
    final l10n = await _localizationsFor(tester, const Locale('fr'));
    expect(l10n.localeName, 'fr');
    expect(l10n.navStudy, 'Étudier');
    expect(l10n.studyShowAnswer, 'Afficher la réponse');
  });

  testWidgets('arabe — écriture différente, donc vraie traduction',
      (tester) async {
    final l10n = await _localizationsFor(tester, const Locale('ar'));
    expect(l10n.localeName, 'ar');
    // Si une clé n'était pas traduite, elle sortirait en caractères
    // latins : on vérifie la présence d'arabe, pas un mot précis.
    expect(RegExp(r'[\u0600-\u06FF]').hasMatch(l10n.navStudy), isTrue);
    expect(RegExp(r'[\u0600-\u06FF]').hasMatch(l10n.studyShowAnswer), isTrue);
  });

  testWidgets('anglais', (tester) async {
    final l10n = await _localizationsFor(tester, const Locale('en'));
    expect(l10n.localeName, 'en');
    expect(l10n.navStudy, 'Study');
    expect(l10n.studyShowAnswer, 'Show answer');
  });

  testWidgets('une langue non supportée retombe sur le français',
      (tester) async {
    // Le produit s'adresse à l'Algérie : le français est le repli
    // naturel, jamais l'anglais.
    final l10n = await _localizationsFor(tester, const Locale('es'));
    expect(l10n.navStudy, 'Étudier');
  });

  group('pluriels', () {
    testWidgets('français : 0, 1, N sont distincts', (tester) async {
      final l10n = await _localizationsFor(tester, const Locale('fr'));
      expect(l10n.homeDueCount(0), 'Rien à réviser');
      expect(l10n.homeDueCount(1), '1 carte');
      expect(l10n.homeDueCount(7), '7 cartes');
    });

    testWidgets('anglais : 0, 1, N sont distincts', (tester) async {
      final l10n = await _localizationsFor(tester, const Locale('en'));
      expect(l10n.homeDueCount(0), 'Nothing due');
      expect(l10n.homeDueCount(1), '1 card');
      expect(l10n.homeDueCount(7), '7 cards');
    });

    testWidgets('arabe : les trois formes existent et diffèrent',
        (tester) async {
      final l10n = await _localizationsFor(tester, const Locale('ar'));
      final zero = l10n.homeDueCount(0);
      final one = l10n.homeDueCount(1);
      final many = l10n.homeDueCount(7);
      expect({zero, one, many}, hasLength(3));
      expect(many, contains('7'));
    });
  });

  group('interpolation', () {
    testWidgets('les placeholders sont réellement substitués',
        (tester) async {
      for (final locale in AppLocalizations.supportedLocales) {
        final l10n = await _localizationsFor(tester, locale);
        // Un `{name}` littéral dans la sortie signifierait une clé mal
        // déclarée dans le .arb — la faute la plus facile à commettre.
        final greeting = l10n.homeGreeting('Yasmine');
        expect(greeting, contains('Yasmine'));
        expect(greeting, isNot(contains('{')));

        final score = l10n.examsScore(87);
        expect(score, contains('87'));
        expect(score, isNot(contains('{')));

        final progress = l10n.studyProgress(3, 12);
        expect(progress, contains('3'));
        expect(progress, contains('12'));
        expect(progress, isNot(contains('{')));
      }
    });
  });

  group('couverture', () {
    testWidgets('aucune chaîne vide dans aucune langue', (tester) async {
      for (final locale in AppLocalizations.supportedLocales) {
        final l10n = await _localizationsFor(tester, locale);
        // Échantillon représentatif des écrans migrés (audit P1-4).
        final samples = <String>[
          l10n.appTitle,
          l10n.navHome,
          l10n.authLogin,
          l10n.homeStartStudy,
          l10n.studyRatingAgain,
          l10n.decksTitle,
          l10n.examsSubmit,
          l10n.paywallCta,
          l10n.profileLogout,
          l10n.leaderboardTitle,
          l10n.badgesTitle,
          l10n.tutorTitle,
          l10n.voiceTitle,
          l10n.mlPredictionTitle,
          l10n.aiHintLabel,
          l10n.notifPermissionAllow,
        ];
        for (final s in samples) {
          expect(s.trim(), isNotEmpty,
              reason: 'chaîne vide en ${locale.languageCode}');
        }
      }
    });
  });
}
