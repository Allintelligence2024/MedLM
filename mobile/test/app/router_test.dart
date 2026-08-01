// Tests audit P0-2 — règles de redirection du routeur.
//
// La redirection est extraite en fonction pure (`computeRedirect`)
// précisément pour être testée ici sans monter de widget ni de
// GoRouter : ce sont les RÈGLES qui doivent être justes, et elles
// décident de ce que voit l'utilisateur au démarrage.
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/app/router.dart';
import 'package:medanki_dz/core/session/session_controller.dart';

void main() {
  group('session non résolue', () {
    test('envoie sur le splash depuis n\'importe où', () {
      expect(
        computeRedirect(
          status: SessionStatus.unknown,
          onboardingCompleted: true,
          location: Routes.home,
        ),
        Routes.splash,
      );
    });

    test('ne boucle pas sur le splash lui-même', () {
      // Une redirection vers la route courante ferait tourner
      // go_router en rond.
      expect(
        computeRedirect(
          status: SessionStatus.unknown,
          onboardingCompleted: true,
          location: Routes.splash,
        ),
        isNull,
      );
    });
  });

  group('anonyme', () {
    test('accès refusé aux routes privées', () {
      for (final path in [Routes.home, Routes.study, Routes.profile]) {
        expect(
          computeRedirect(
            status: SessionStatus.anonymous,
            onboardingCompleted: false,
            location: path,
          ),
          Routes.welcome,
          reason: '$path devrait rediriger vers welcome',
        );
      }
    });

    test('laisse passer welcome, login et signup', () {
      for (final path in [Routes.welcome, Routes.login, Routes.signup]) {
        expect(
          computeRedirect(
            status: SessionStatus.anonymous,
            onboardingCompleted: false,
            location: path,
          ),
          isNull,
          reason: '$path devrait rester accessible',
        );
      }
    });

    test('quitte le splash une fois la session résolue', () {
      expect(
        computeRedirect(
          status: SessionStatus.anonymous,
          onboardingCompleted: false,
          location: Routes.splash,
        ),
        Routes.welcome,
      );
    });
  });

  group('authentifié, onboarding non terminé', () {
    test('toute route privée mène à l\'onboarding', () {
      expect(
        computeRedirect(
          status: SessionStatus.authenticated,
          onboardingCompleted: false,
          location: Routes.home,
        ),
        Routes.onboarding,
      );
    });

    test('l\'onboarding lui-même est accessible', () {
      expect(
        computeRedirect(
          status: SessionStatus.authenticated,
          onboardingCompleted: false,
          location: Routes.onboarding,
        ),
        isNull,
      );
    });

    test('les écrans anonymes renvoient à l\'onboarding', () {
      expect(
        computeRedirect(
          status: SessionStatus.authenticated,
          onboardingCompleted: false,
          location: Routes.login,
        ),
        Routes.onboarding,
      );
    });
  });

  group('authentifié, onboarding terminé', () {
    test('laisse circuler librement', () {
      for (final path in [Routes.home, Routes.study, Routes.exams]) {
        expect(
          computeRedirect(
            status: SessionStatus.authenticated,
            onboardingCompleted: true,
            location: path,
          ),
          isNull,
        );
      }
    });

    test('refuser de refaire l\'onboarding', () {
      expect(
        computeRedirect(
          status: SessionStatus.authenticated,
          onboardingCompleted: true,
          location: Routes.onboarding,
        ),
        Routes.home,
      );
    });

    test('les écrans de connexion renvoient à l\'accueil', () {
      for (final path in [Routes.welcome, Routes.login, Routes.signup]) {
        expect(
          computeRedirect(
            status: SessionStatus.authenticated,
            onboardingCompleted: true,
            location: path,
          ),
          Routes.home,
        );
      }
    });
  });

  group('Routes', () {
    test('toutes les routes publiques commencent par /', () {
      for (final path in Routes.publicPaths) {
        expect(path.startsWith('/'), isTrue);
      }
    });

    test('l\'accueil n\'est pas public', () {
      // Sinon un utilisateur déconnecté verrait un tableau de bord vide
      // au lieu de l'écran d'accueil produit.
      expect(Routes.publicPaths.contains(Routes.home), isFalse);
    });
  });
}
