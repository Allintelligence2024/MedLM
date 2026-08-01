/// Inscription — e-mail, nom affiché, faculté, année.
///
/// Faculté et année sont demandées ici parce qu'elles conditionnent le
/// classement et les recommandations dès la première session. Ce sont
/// des listes fermées : un champ libre produirait « Alger », « alger »
/// et « Fac d'Alger » comme trois facultés distinctes.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/content/faculties.dart';
import '../../core/di/providers.dart';
import '../../l10n/app_localizations.dart';
import '../common/async_view.dart';
import 'email_field.dart';

class SignupScreen extends ConsumerStatefulWidget {
  const SignupScreen({super.key});

  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _displayName = TextEditingController();
  String? _faculty;
  int _studyYear = 1;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _displayName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref.read(apiClientProvider).signupWithEmail(
            email: _email.text.trim(),
            displayName: _displayName.text.trim().isEmpty
                ? null
                : _displayName.text.trim(),
            faculty: _faculty,
            studyYear: _studyYear,
          );
      await ref.read(sessionProvider.notifier).signIn(
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            userId: result.userId,
            email: _email.text.trim(),
          );
      // Pas de navigation manuelle : le routeur enverra vers
      // l'onboarding, qui n'est pas encore marqué comme terminé.
    } catch (e) {
      if (mounted) setState(() => _error = describeError(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.authSignup)),
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
                TextFormField(
                  controller: _displayName,
                  enabled: !_busy,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: l10n.authDisplayName,
                    prefixIcon: const Icon(Icons.badge_outlined),
                  ),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: _faculty,
                  decoration: InputDecoration(
                    labelText: l10n.authFaculty,
                    prefixIcon: const Icon(Icons.location_city_outlined),
                  ),
                  items: [
                    for (final f in kFacultiesDz)
                      DropdownMenuItem<String>(value: f, child: Text(f)),
                  ],
                  onChanged: _busy ? null : (v) => setState(() => _faculty = v),
                  validator: (v) => v == null ? l10n.authFacultyRequired : null,
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<int>(
                  value: _studyYear,
                  decoration: InputDecoration(
                    labelText: l10n.authStudyYear,
                    prefixIcon: const Icon(Icons.calendar_today_outlined),
                  ),
                  items: [
                    for (final y in kStudyYears)
                      DropdownMenuItem<int>(value: y, child: Text('$y')),
                  ],
                  onChanged:
                      _busy ? null : (v) => setState(() => _studyYear = v ?? 1),
                ),
                const SizedBox(height: 24),
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
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(l10n.authSignup),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: _busy ? null : () => context.go(Routes.login),
                  child: Text(l10n.authHaveAccount),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
