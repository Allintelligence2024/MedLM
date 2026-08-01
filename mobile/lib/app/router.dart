/// Routeur applicatif (go_router) — audit P0-2.
///
/// Avant ce lot, `lib/` était une bibliothèque : 69 fichiers, aucun
/// point d'entrée, aucun écran atteignable. Il n'y avait ni `main.dart`
/// ni navigation — les 4 écrans IA, les 2 de gamification et celui
/// d'étude n'étaient importés de nulle part.
///
/// Deux règles de redirection, et elles suffisent :
///   1. session non authentifiée → `/welcome` (sauf routes publiques) ;
///   2. session authentifiée mais onboarding non terminé → `/onboarding`.
///
/// Tant que la session n'est pas *résolue* (relecture du stockage
/// sécurisé), on n'oriente nulle part : on affiche l'écran de
/// démarrage. Rediriger trop tôt ferait clignoter l'écran de connexion
/// devant un utilisateur déjà connecté.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/di/providers.dart';
import '../core/session/session_controller.dart';
import '../core/settings/app_settings.dart';
import '../ui/auth/login_screen.dart';
import '../ui/auth/signup_screen.dart';
import '../ui/auth/welcome_screen.dart';
import '../ui/billing/paywall_screen.dart';
import '../ui/decks/deck_catalog_screen.dart';
import '../ui/exams/exam_attempt_screen.dart';
import '../ui/exams/exam_list_screen.dart';
import '../ui/exams/exam_result_screen.dart';
import '../ui/gamification/badges_screen.dart';
import '../ui/gamification/leaderboard_screen.dart';
import '../ui/home/home_screen.dart';
import '../ui/notifications/notification_permission_screen.dart';
import '../ui/onboarding/onboarding_screen.dart';
import '../ui/profile/profile_screen.dart';
import '../ui/shell/app_shell.dart';
import '../ui/splash/splash_screen.dart';
import '../ui/study/study_screen.dart';

/// Chemins nommés — centralisés pour éviter les chaînes en dur
/// disséminées (et pour que les deep links des notifications visent
/// des routes qui existent réellement).
class Routes {
  static const splash = '/splash';
  static const welcome = '/welcome';
  static const login = '/login';
  static const signup = '/signup';
  static const onboarding = '/onboarding';
  static const home = '/';
  static const study = '/study';
  static const decks = '/decks';
  static const exams = '/exams';
  static const examAttempt = '/exams/attempt';
  static const examResult = '/exams/result';
  static const profile = '/profile';
  static const paywall = '/paywall';
  static const leaderboard = '/leaderboard';
  static const badges = '/badges';
  static const notificationPermission = '/notifications/permission';

  /// Routes accessibles sans session.
  static const publicPaths = <String>{splash, welcome, login, signup};
}

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

/// Calcule la redirection. Extrait en fonction pure pour être testable
/// sans monter de widget (cf. test/app/router_test.dart).
String? computeRedirect({
  required SessionStatus status,
  required bool onboardingCompleted,
  required String location,
}) {
  // Session pas encore résolue : on reste sur l'écran de démarrage.
  if (status == SessionStatus.unknown) {
    return location == Routes.splash ? null : Routes.splash;
  }

  final isPublic = Routes.publicPaths.contains(location);

  if (status == SessionStatus.anonymous) {
    return isPublic && location != Routes.splash ? null : Routes.welcome;
  }

  // Authentifié : les écrans d'accueil anonyme n'ont plus de sens.
  if (isPublic) {
    return onboardingCompleted ? Routes.home : Routes.onboarding;
  }
  if (!onboardingCompleted && location != Routes.onboarding) {
    return Routes.onboarding;
  }
  if (onboardingCompleted && location == Routes.onboarding) {
    return Routes.home;
  }
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  // `Listenable` reconstruit par Riverpod : le routeur réévalue ses
  // redirections dès que la session ou les préférences changent.
  final refresh = ValueNotifier<int>(0);
  ref.listen(sessionProvider, (_, __) => refresh.value++);
  ref.listen(settingsProvider, (_, __) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final settings = ref.read(settingsProvider).valueOrNull;
      return computeRedirect(
        status: session.status,
        // Tant que les préférences ne sont pas chargées, on suppose
        // l'onboarding fait : le contraire enverrait un utilisateur
        // établi le refaire à chaque démarrage lent.
        onboardingCompleted: settings?.onboardingCompleted ?? true,
        location: state.matchedLocation,
      );
    },
    routes: [
      GoRoute(
        path: Routes.splash,
        builder: (_, __) => const SplashScreen(),
      ),
      GoRoute(
        path: Routes.welcome,
        builder: (_, __) => const WelcomeScreen(),
      ),
      GoRoute(
        path: Routes.login,
        builder: (_, __) => const LoginScreen(),
      ),
      GoRoute(
        path: Routes.signup,
        builder: (_, __) => const SignupScreen(),
      ),
      GoRoute(
        path: Routes.onboarding,
        builder: (_, __) => const OnboardingScreen(),
      ),

      // Coquille à navigation basse : les 5 destinations principales
      // partagent la même barre, sans reconstruire l'écran entier.
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) =>
            AppShell(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(
            path: Routes.home,
            builder: (_, __) => const HomeScreen(),
          ),
          GoRoute(
            path: Routes.study,
            builder: (context, state) {
              final container = ref.read(appContainerProvider);
              final userId = ref.read(sessionProvider).userId ?? '';
              final settings = ref.read(settingsProvider).valueOrNull;
              return StudyScreen(
                container: container,
                userId: userId,
                deckId: state.uri.queryParameters['deck'],
                newCardsPerDay: settings?.dailyGoalCards ?? 20,
              );
            },
          ),
          GoRoute(
            path: Routes.decks,
            builder: (_, __) => const DeckCatalogScreen(),
          ),
          GoRoute(
            path: Routes.exams,
            builder: (_, __) => const ExamListScreen(),
          ),
          GoRoute(
            path: Routes.profile,
            builder: (_, __) => const ProfileScreen(),
          ),
        ],
      ),

      // Écrans plein cadre (hors coquille).
      GoRoute(
        path: Routes.examAttempt,
        builder: (context, state) {
          final extra = state.extra;
          return ExamAttemptScreen(
            attempt: extra is Map<String, dynamic> ? extra : const {},
          );
        },
      ),
      GoRoute(
        path: Routes.examResult,
        builder: (context, state) {
          final extra = state.extra;
          return ExamResultScreen(
            result: extra is Map<String, dynamic> ? extra : const {},
          );
        },
      ),
      GoRoute(
        path: Routes.paywall,
        builder: (_, __) => const PaywallScreen(),
      ),
      GoRoute(
        path: Routes.leaderboard,
        builder: (context, __) => LeaderboardScreen(
          repository: ref.read(leaderboardRepositoryProvider),
        ),
      ),
      GoRoute(
        path: Routes.badges,
        builder: (context, __) => BadgesScreen(
          api: ref.read(apiClientProvider),
        ),
      ),
      GoRoute(
        path: Routes.notificationPermission,
        builder: (_, __) => const NotificationPermissionScreen(),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(child: Text(state.error?.toString() ?? 'Route inconnue')),
    ),
  );
});
