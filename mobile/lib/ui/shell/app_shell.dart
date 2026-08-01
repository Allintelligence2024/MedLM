/// Coquille de navigation — barre inférieure à 5 destinations.
///
/// Les destinations reflètent les cinq intentions réelles de
/// l'utilisateur : voir où j'en suis, réviser, chercher un cours,
/// m'entraîner à l'examen, gérer mon compte. Rien d'autre n'a sa place
/// ici — le classement, les badges et le paywall s'atteignent depuis
/// l'accueil ou le profil.
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../l10n/app_localizations.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  static const _destinations = <String>[
    Routes.home,
    Routes.study,
    Routes.decks,
    Routes.exams,
    Routes.profile,
  ];

  /// Index de l'onglet actif. Robuste aux sous-routes (`/exams/attempt`
  /// garde l'onglet Examens allumé) et aux chemins inconnus.
  static int indexFor(String location) {
    // On teste les chemins les plus longs d'abord : sinon `/` capterait
    // tout, puisque toute route commence par `/`.
    final byLength = [..._destinations]
      ..sort((a, b) => b.length.compareTo(a.length));
    for (final path in byLength) {
      if (path == Routes.home) continue;
      if (location == path || location.startsWith('$path/')) {
        return _destinations.indexOf(path);
      }
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: indexFor(location),
        onDestinationSelected: (index) => context.go(_destinations[index]),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: l10n.navHome,
          ),
          NavigationDestination(
            icon: const Icon(Icons.style_outlined),
            selectedIcon: const Icon(Icons.style),
            label: l10n.navStudy,
          ),
          NavigationDestination(
            icon: const Icon(Icons.library_books_outlined),
            selectedIcon: const Icon(Icons.library_books),
            label: l10n.navDecks,
          ),
          NavigationDestination(
            icon: const Icon(Icons.assignment_outlined),
            selectedIcon: const Icon(Icons.assignment),
            label: l10n.navExams,
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
            label: l10n.navProfile,
          ),
        ],
      ),
    );
  }
}
