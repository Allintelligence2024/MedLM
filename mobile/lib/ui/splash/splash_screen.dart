/// Écran de démarrage — affiché tant que la session n'est pas résolue.
///
/// Sa seule raison d'être : éviter que l'écran de connexion clignote
/// devant un utilisateur déjà authentifié pendant la relecture du
/// stockage sécurisé (qui prend quelques dizaines de ms, mais parfois
/// bien plus si le téléphone vient de démarrer).
library;

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.school_outlined,
              size: 56,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              AppLocalizations.of(context).appTitle,
              style: theme.textTheme.titleLarge,
            ),
            const SizedBox(height: 24),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ],
        ),
      ),
    );
  }
}
