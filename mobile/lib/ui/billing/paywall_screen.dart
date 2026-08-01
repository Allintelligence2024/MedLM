/// Paywall — abonnement Premium via Chargily.
///
/// Le paiement se fait dans le NAVIGATEUR, pas dans l'application :
/// Chargily gère CIB/BaridiMob côté web, et faire transiter une page de
/// paiement par une WebView embarquée dégraderait la confiance autant
/// que la sécurité.
///
/// Au retour, l'entitlement n'est pas supposé : on le relit depuis le
/// serveur (le webhook Chargily peut mettre quelques secondes).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/di/providers.dart';
import '../../domain/domain.dart';
import '../../l10n/app_localizations.dart';
import '../common/async_view.dart';

final entitlementProvider = FutureProvider<EntitlementState>((ref) async {
  return ref.watch(entitlementRepositoryProvider).current();
});

class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({super.key});

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen> {
  bool _busy = false;

  Future<void> _checkout() async {
    setState(() => _busy = true);
    try {
      final res =
          await ref.read(apiClientProvider).createCheckout(plan: 'premium');
      final url = (res['checkout_url'] ?? res['url'])?.toString();
      if (url == null || url.isEmpty) {
        // Message d'exception technique, capté par le catch et
        // remplacé à l'écran par un texte localisé.
        throw StateError('checkout_url absent de la réponse'); // ignore: hardcoded-string
      }
      final uri = Uri.parse(url);
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(describeError(context, e))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final entitlement = ref.watch(entitlementProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.paywallTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Icon(
              Icons.workspace_premium_outlined,
              size: 56,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 24),
            _Benefit(icon: Icons.library_books, text: l10n.paywallBenefitDecks),
            _Benefit(icon: Icons.assignment, text: l10n.paywallBenefitExams),
            _Benefit(icon: Icons.psychology, text: l10n.paywallBenefitAi),
            const SizedBox(height: 24),
            if (entitlement != null &&
                entitlement.canAccessPremiumAt(
                  DateTime.now().millisecondsSinceEpoch,
                ))
              Card(
                color: theme.colorScheme.primaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    l10n.paywallActiveUntil(_formatDate(entitlement)),
                  ),
                ),
              )
            else ...[
              FilledButton.icon(
                onPressed: _busy ? null : _checkout,
                icon: const Icon(Icons.payment),
                label: Text(l10n.paywallCta),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _busy
                    ? null
                    : () => ref.invalidate(entitlementProvider),
                child: Text(l10n.paywallRestore),
              ),
            ],
            const SizedBox(height: 24),
            OutlinedButton.icon(
              // Packs de groupe (Phase 16.3) : l'endpoint existe, le
              // parcours de saisie de code reste à concevoir avec
              // l'équipe produit. Bouton visible mais inactif plutôt
              // qu'un écran mort.
              onPressed: null,
              icon: const Icon(Icons.group_outlined),
              label: Text(l10n.paywallJoinGroup),
            ),
          ],
        ),
      ),
    );
  }

  static String _formatDate(EntitlementState state) {
    // La grace period prolonge l'accès au-delà de l'expiration du
    // jeton : c'est cette date-là qui intéresse l'utilisateur.
    final ms = state.graceUntilMs != null &&
            state.graceUntilMs! > state.expiresAtMs
        ? state.graceUntilMs!
        : state.expiresAtMs;
    if (ms == 0) return '—';
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    return '${d.day.toString().padLeft(2, '0')}/'
        '${d.month.toString().padLeft(2, '0')}/${d.year}';
  }
}

class _Benefit extends StatelessWidget {
  const _Benefit({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 12),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}
