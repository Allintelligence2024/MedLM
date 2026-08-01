// Tests widget — StudyScreen (intégration IA : HintBanner +
// VoiceDictationSheet + boucle offline-first).
//
// On vérifie la boucle complète avec coutures injectées (queueLoader /
// reviewRecorder + in-memory db) :
//   * chargement → question affichée, réponse cachée ;
//   * révélation → réponse visible, 4 boutons de rating ;
//   * rating → revue enregistrée (+ durationMs), carte suivante ;
//   * dernière carte → écran de synthèse (compteurs justes) ;
//   * queue vide → message « rien à réviser » ;
//   * l'action micro ouvre la feuille de dictée ;
//   * erreur de chargement → message + retry.
library;

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/container/app_container.dart';
import 'package:medanki_dz/data/local/app_database.dart';
import 'package:medanki_dz/domain/domain.dart';
import 'package:medanki_dz/ui/ai/voice_dictation_sheet.dart';
import 'package:medanki_dz/l10n/app_localizations.dart';
import 'package:medanki_dz/ui/study/study_screen.dart';

/// Monte un écran avec les Localizations (audit P1-4 : les écrans
/// exigent désormais un ancêtre AppLocalizations).
Widget _app(Widget child) => MaterialApp(
      locale: const Locale('fr'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: child,
    );

StudyQueueItem _item(int n) => StudyQueueItem(
      cardId: 'card-$n',
      deckId: 'deck-1',
      cardType: CardType.basic,
      frontTextFr: 'Question $n : capitale de l\u2019Algérie ?',
      frontTextEn: '',
      backTextFr: 'Réponse $n : Alger',
      backTextEn: '',
      state: SrsCardState.initial,
    );

AppContainer _container(AppDatabase db) =>
    AppContainer(database: db, apiBaseUrl: 'http://test');

void main() {
  late AppDatabase db;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
  });
  tearDown(() => db.close());

  testWidgets('boucle complète : question → réponse → rating → suivante '
      '→ synthèse', (tester) async {
    final recorded = <(String, Rating)>[];
    await tester.pumpWidget(_app(
      StudyScreen(
        container: _container(db),
        userId: 'u1',
        queueLoader: (_, __, ___) async => [_item(1), _item(2)],
        reviewRecorder: (userId, cardId, rating, durationMs) async {
          recorded.add((cardId, rating));
        },
      ),
    ));
    await tester.pumpAndSettle();

    // Carte 1 : question visible, réponse cachée, micro présent.
    expect(find.textContaining('Question 1'), findsOneWidget);
    expect(find.textContaining('Réponse 1'), findsNothing);
    expect(find.byTooltip('Dicter une carte'), findsOneWidget);

    // Révélation.
    await tester.tap(find.text('Afficher la réponse'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Réponse 1 : Alger'), findsOneWidget);
    for (final label in ['Encore', 'Difficile', 'Bien', 'Facile']) {
      expect(find.text(label), findsOneWidget);
    }

    // Rating « Bien » → carte 2.
    await tester.tap(find.text('Bien'));
    await tester.pumpAndSettle();
    expect(recorded, [('card-1', Rating.good)]);
    expect(find.textContaining('Question 2'), findsOneWidget);

    // Réponse et rating « Encore » → fin.
    await tester.tap(find.text('Afficher la réponse'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Encore'));
    await tester.pumpAndSettle();
    expect(recorded.length, 2);
    expect(recorded.last, ('card-2', Rating.again));
    expect(find.text('Session terminée'), findsOneWidget);
    expect(find.textContaining('2 cartes revues'), findsOneWidget);
    expect(find.textContaining('1 à revoir bientôt'), findsOneWidget);
  });

  testWidgets('queue vide → message rien à réviser', (tester) async {
    await tester.pumpWidget(_app(
      StudyScreen(
        container: _container(db),
        userId: 'u1',
        queueLoader: (_, __, ___) async => const [],
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('Rien à réviser'), findsOneWidget);
    expect(find.byTooltip('Dicter une carte'), findsNothing);
  });

  testWidgets('erreur de chargement → message + retry fonctionnel',
      (tester) async {
    var attempts = 0;
    await tester.pumpWidget(_app(
      StudyScreen(
        container: _container(db),
        userId: 'u1',
        queueLoader: (_, __, ___) async {
          attempts += 1;
          if (attempts == 1) throw StateError('db fermée');
          return [_item(1)];
        },
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('Impossible de préparer'), findsOneWidget);
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Question 1'), findsOneWidget);
  });

  testWidgets('le micro ouvre la feuille de dictée (sans bloquer '
      'la session)', (tester) async {
    await tester.pumpWidget(_app(
      StudyScreen(
        container: _container(db),
        userId: 'u1',
        queueLoader: (_, __, ___) async => [_item(1)],
        reviewRecorder: (_, __, ___, ____) async {},
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Dicter une carte'));
    await tester.pumpAndSettle();
    expect(find.byType(VoiceDictationSheet), findsOneWidget);
    expect(find.text('Dicter une carte'), findsWidgets);
    // Fermer la feuille et vérifier que la session est intacte.
    Navigator.of(tester.element(find.byType(VoiceDictationSheet))).pop();
    await tester.pumpAndSettle();
    expect(find.textContaining('Question 1'), findsOneWidget);
  });
}
