// Tests audit P1-3 — deep links des notifications.
//
// La table de correspondance `kind` → route est le seul endroit où le
// contrat backend (`push.types.ts`) rencontre le routeur mobile. Une
// erreur ici envoie l'utilisateur sur un écran vide après avoir touché
// sa notification — le pire moment pour le décevoir.
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/app/router.dart';
import 'package:medanki_dz/core/notifications/push_notifications.dart';

void main() {
  group('deepLinkFor', () {
    test('les rappels de révision mènent à la session d\'étude', () {
      // Pas à l'accueil : l'utilisateur a touché « tu as 12 cartes
      // dues », il veut réviser, pas lire un tableau de bord.
      for (final kind in ['due_reminder', 'streak_danger', 'retention_alert']) {
        expect(
          deepLinkFor({'kind': kind}),
          const PushDeepLink(Routes.study),
          reason: '$kind devrait mener à ${Routes.study}',
        );
      }
    });

    test('une mise à jour de deck mène au catalogue', () {
      expect(
        deepLinkFor({'kind': 'deck_updated'}),
        const PushDeepLink(Routes.decks),
      );
    });

    test('un deeplink explicite prime sur le kind', () {
      expect(
        deepLinkFor({'kind': 'due_reminder', 'deeplink': '/exams'}),
        const PushDeepLink('/exams'),
      );
    });

    test('un deeplink malformé est ignoré au profit du kind', () {
      // Ni « exams » (pas de slash), ni « / » seul ne sont des
      // destinations : on retombe sur la règle par défaut plutôt que
      // de naviguer n'importe où.
      expect(
        deepLinkFor({'kind': 'due_reminder', 'deeplink': 'exams'}),
        const PushDeepLink(Routes.study),
      );
      expect(
        deepLinkFor({'kind': 'due_reminder', 'deeplink': '/'}),
        const PushDeepLink(Routes.study),
      );
      expect(
        deepLinkFor({'kind': 'due_reminder', 'deeplink': 42}),
        const PushDeepLink(Routes.study),
      );
    });

    test('un kind inconnu ne navigue nulle part', () {
      // Une version future du backend peut inventer un kind : mieux
      // vaut ouvrir l'app normalement que de sauter sur un écran faux.
      expect(deepLinkFor({'kind': 'quelque_chose_de_neuf'}), isNull);
      expect(deepLinkFor(const {}), isNull);
    });

    test('toutes les routes ciblées existent réellement', () {
      final targets = [
        for (final kind in [
          'due_reminder',
          'streak_danger',
          'retention_alert',
          'deck_updated',
        ])
          deepLinkFor({'kind': kind})!.location,
      ];
      const known = {
        Routes.study,
        Routes.decks,
        Routes.exams,
        Routes.home,
        Routes.profile,
      };
      for (final t in targets) {
        expect(known.contains(t), isTrue, reason: '$t inconnue du routeur');
      }
    });
  });

  group('PushDeepLink', () {
    test('égalité par valeur', () {
      expect(const PushDeepLink('/study'), const PushDeepLink('/study'));
      expect(
        const PushDeepLink('/study').hashCode,
        const PushDeepLink('/study').hashCode,
      );
      expect(const PushDeepLink('/study'), isNot(const PushDeepLink('/decks')));
    });
  });
}
