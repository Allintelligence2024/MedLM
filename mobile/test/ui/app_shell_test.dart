// Tests audit P1-2 — onglet actif de la coquille de navigation.
//
// Le piège : `/` est un préfixe de TOUTES les routes. Une comparaison
// naïve par `startsWith` allumerait l'onglet Accueil en permanence.
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/app/router.dart';
import 'package:medanki_dz/ui/shell/app_shell.dart';

void main() {
  group('AppShell.indexFor', () {
    test('associe chaque destination à son onglet', () {
      expect(AppShell.indexFor(Routes.home), 0);
      expect(AppShell.indexFor(Routes.study), 1);
      expect(AppShell.indexFor(Routes.decks), 2);
      expect(AppShell.indexFor(Routes.exams), 3);
      expect(AppShell.indexFor(Routes.profile), 4);
    });

    test('une sous-route garde son onglet parent allumé', () {
      expect(AppShell.indexFor('/exams/attempt'), 3);
      expect(AppShell.indexFor('/exams/result'), 3);
    });

    test('une route inconnue retombe sur l\'accueil', () {
      expect(AppShell.indexFor('/inexistant'), 0);
      expect(AppShell.indexFor(''), 0);
    });

    test('un chemin qui commence comme une destination sans en être une', () {
      // `/examens-truc` n'est pas une sous-route de `/exams`.
      expect(AppShell.indexFor('/studyx'), 0);
      expect(AppShell.indexFor('/decksomething'), 0);
    });

    test('l\'accueil ne capte pas les autres routes', () {
      // Régression du piège décrit en tête de fichier.
      expect(AppShell.indexFor(Routes.study), isNot(0));
      expect(AppShell.indexFor(Routes.profile), isNot(0));
    });
  });
}
