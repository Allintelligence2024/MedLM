// Tests audit P1-2 — validation d'e-mail côté client.
//
// Objectif explicite : attraper les fautes de frappe évidentes SANS
// jamais refuser une adresse valide. Le seul juge fiable est le
// serveur ; un validateur trop zélé bloquerait des inscriptions
// légitimes.
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/ui/auth/email_field.dart';

void main() {
  group('accepte les adresses plausibles', () {
    const valides = [
      'etudiant@univ-alger.dz',
      'a.b@c.dz',
      'prenom.nom+tag@gmail.com',
      'user_name@fac-medecine.oran.dz',
      "o'brien@example.com",
      'chiffre123@example.co.uk',
    ];

    for (final email in valides) {
      test(email, () => expect(isPlausibleEmail(email), isTrue));
    }

    test('tolère les espaces autour', () {
      expect(isPlausibleEmail('  a@b.dz  '), isTrue);
    });
  });

  group('refuse les fautes de frappe évidentes', () {
    const invalides = <String, String>{
      '': 'vide',
      'pas-d-arobase.dz': 'sans @',
      '@example.com': 'partie locale vide',
      'a@b': 'domaine sans point',
      'a@b.': 'domaine finissant par un point',
      'a@.com': 'domaine commençant par un point',
      'a@@b.dz': 'double @',
      'a b@c.dz': 'espace interne',
    };

    invalides.forEach((email, raison) {
      test('$raison : « $email »',
          () => expect(isPlausibleEmail(email), isFalse));
    });

    test('adresse absurdement longue', () {
      expect(isPlausibleEmail('${'a' * 250}@b.dz'), isFalse);
    });
  });
}
