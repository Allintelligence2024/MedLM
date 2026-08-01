/// Champ e-mail partagé entre connexion et inscription.
library;

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// Validation d'e-mail volontairement permissive.
///
/// On ne cherche pas à implémenter la RFC 5322 : le seul juge fiable
/// est le serveur (et, en dernier ressort, la réception du message).
/// Le rôle de cette fonction est d'attraper les fautes de frappe
/// évidentes sans jamais refuser une adresse valide exotique.
bool isPlausibleEmail(String value) {
  final v = value.trim();
  if (v.length < 5 || v.length > 254) return false;
  if (v.contains(' ')) return false;
  final at = v.indexOf('@');
  if (at <= 0 || at != v.lastIndexOf('@')) return false;
  final domain = v.substring(at + 1);
  if (!domain.contains('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  return true;
}

class EmailField extends StatelessWidget {
  const EmailField({super.key, required this.controller, this.enabled = true});

  final TextEditingController controller;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return TextFormField(
      controller: controller,
      enabled: enabled,
      keyboardType: TextInputType.emailAddress,
      autofillHints: const [AutofillHints.email],
      textInputAction: TextInputAction.done,
      decoration: InputDecoration(
        labelText: l10n.authEmail,
        prefixIcon: const Icon(Icons.alternate_email),
      ),
      validator: (value) =>
          isPlausibleEmail(value ?? '') ? null : l10n.authEmailInvalid,
    );
  }
}
