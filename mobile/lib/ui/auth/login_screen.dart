/// Connexion — e-mail, lien magique, Google.
///
/// Trois chemins, un seul écran : saisir son e-mail suffit pour les
/// trois. Le lien magique évite un mot de passe de plus à retenir ;
/// Google évite la boîte mail quand elle est déjà connectée.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/di/providers.dart';
import '../../l10n/app_localizations.dart';
import '../common/async_view.dart';
import 'email_field.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _magicLinkSent = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = describeError(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _login() => _run(() async {
        final api = ref.read(apiClientProvider);
        final result = await api.loginWithEmail(email: _email.text.trim());
        await ref.read(sessionProvider.notifier).signIn(
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              userId: result.userId,
              email: _email.text.trim(),
            );
        // La redirection est pilotée par le routeur : dès que la
        // session passe à `authenticated`, il oriente vers l'accueil
        // ou l'onboarding. On ne navigue pas à la main ici, sinon les
        // deux logiques se contrediraient.
      });

  Future<void> _magicLink() => _run(() async {
        await ref
            .read(apiClientProvider)
            .requestMagicLink(email: _email.text.trim());
        if (mounted) setState(() => _magicLinkSent = true);
      });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.authLogin)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                EmailField(controller: _email, enabled: !_busy),
                const SizedBox(height: 16),
                if (_magicLinkSent)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      l10n.authMagicLinkSent,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      _error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                FilledButton(
                  onPressed: _busy ? null : _login,
                  child: _busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(l10n.authLogin),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _magicLink,
                  icon: const Icon(Icons.mail_outline),
                  label: Text(l10n.authMagicLink),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  // OAuth Google : le backend expose déjà
                  // GET /v1/auth/google (redirection). L'ouverture du
                  // navigateur système et la reprise par deep link
                  // demandent une configuration de plateforme
                  // (intent-filter / associated domain) qui n'est pas
                  // encore posée — le bouton reste donc désactivé
                  // plutôt que d'ouvrir une impasse.
                  onPressed: null,
                  icon: const Icon(Icons.account_circle_outlined),
                  label: Text(l10n.authGoogle),
                ),
                const SizedBox(height: 24),
                TextButton(
                  onPressed: _busy ? null : () => context.go(Routes.signup),
                  child: Text(l10n.authNoAccount),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
