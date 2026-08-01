/// Petits widgets partagés par les écrans (audit P1-2).
///
/// Trois états reviennent partout : chargement, erreur avec relance,
/// vide. Les factoriser évite que chaque écran réinvente sa propre
/// version — et garantit qu'aucun ne se contente d'un spinner infini
/// quand le réseau tombe (le produit est hors-ligne d'abord : l'échec
/// réseau est le cas NORMAL, pas l'exception).
library;

import 'package:flutter/material.dart';

import '../../data/network/api_exceptions.dart';
import '../../l10n/app_localizations.dart';

/// Message d'erreur lisible, adapté au type d'échec.
String describeError(BuildContext context, Object error) {
  final l10n = AppLocalizations.of(context);
  if (error is NetworkException) return l10n.errorOffline;
  if (error is AuthException) return l10n.errorGeneric;
  return l10n.errorGeneric;
}

/// État d'erreur avec bouton « Réessayer ».
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              error is NetworkException ? Icons.cloud_off : Icons.error_outline,
              size: 40,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 12),
            Text(describeError(context, error), textAlign: TextAlign.center),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: Text(l10n.actionRetry),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// État vide, neutre et non culpabilisant.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon, this.action});

  final String message;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon ?? Icons.inbox_outlined,
              size: 40,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

/// Indicateur de chargement centré.
class LoadingState extends StatelessWidget {
  const LoadingState({super.key});

  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}
