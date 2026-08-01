// Tests audit P1-2 — timer d'examen.
//
// Règle non négociable (v2 §10) : le SERVEUR fait autorité sur le
// temps. Le client lit `expires_at` et affiche une différence ; il ne
// décompte jamais lui-même, sinon changer l'heure du téléphone
// suffirait à s'offrir du rab.
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/ui/exams/exam_timer.dart';

void main() {
  final now = DateTime.utc(2026, 8, 1, 12, 0, 0);

  group('parseExpiry', () {
    test('lit un ISO-8601', () {
      final parsed = parseExpiry({'expires_at': '2026-08-01T12:30:00Z'});
      expect(parsed, DateTime.utc(2026, 8, 1, 12, 30));
    });

    test('lit un epoch en millisecondes', () {
      final ms = DateTime.utc(2026, 8, 1, 12, 30).millisecondsSinceEpoch;
      expect(parseExpiry({'expires_at_ms': ms}),
          DateTime.utc(2026, 8, 1, 12, 30));
    });

    test('l\'epoch prime sur l\'ISO quand les deux sont présents', () {
      final ms = DateTime.utc(2026, 8, 1, 13, 0).millisecondsSinceEpoch;
      final parsed = parseExpiry({
        'expires_at_ms': ms,
        'expires_at': '2026-08-01T12:30:00Z',
      });
      expect(parsed, DateTime.utc(2026, 8, 1, 13, 0));
    });

    test('retourne null si rien d\'exploitable', () {
      expect(parseExpiry({}), isNull);
      expect(parseExpiry({'expires_at': ''}), isNull);
      expect(parseExpiry({'expires_at': 'pas une date'}), isNull);
    });
  });

  group('remaining', () {
    test('calcule le temps restant', () {
      expect(
        remaining(now.add(const Duration(minutes: 5)), now),
        const Duration(minutes: 5),
      );
    });

    test('ne descend jamais sous zéro', () {
      // Un compte à rebours négatif afficherait « -03:12 » à
      // l'utilisateur : jamais.
      expect(
        remaining(now.subtract(const Duration(minutes: 5)), now),
        Duration.zero,
      );
    });
  });

  group('isExpired', () {
    test('faux avant l\'échéance', () {
      expect(isExpired(now.add(const Duration(seconds: 1)), now), isFalse);
    });

    test('vrai À l\'échéance exacte', () {
      expect(isExpired(now, now), isTrue);
    });

    test('vrai après', () {
      expect(isExpired(now.subtract(const Duration(seconds: 1)), now), isTrue);
    });

    test('faux si le serveur n\'a pas donné d\'échéance', () {
      // Pas de timer = examen non chronométré, pas examen expiré.
      expect(isExpired(null, now), isFalse);
    });
  });

  group('formatRemaining', () {
    test('mm:ss sous une heure', () {
      expect(formatRemaining(const Duration(minutes: 5, seconds: 3)), '05:03');
      expect(formatRemaining(Duration.zero), '00:00');
      expect(formatRemaining(const Duration(seconds: 59)), '00:59');
    });

    test('h:mm:ss au-delà', () {
      expect(
        formatRemaining(const Duration(hours: 1, minutes: 2, seconds: 3)),
        '1:02:03',
      );
    });
  });

  group('isUrgent', () {
    test('vrai dans les deux dernières minutes', () {
      expect(isUrgent(const Duration(seconds: 120)), isTrue);
      expect(isUrgent(const Duration(seconds: 1)), isTrue);
    });

    test('faux au-delà', () {
      expect(isUrgent(const Duration(seconds: 121)), isFalse);
    });

    test('faux à zéro (l\'examen est fini, plus rien à presser)', () {
      expect(isUrgent(Duration.zero), isFalse);
    });
  });

  group('parseQuestions', () {
    test('extrait la liste', () {
      final qs = parseQuestions({
        'questions': [
          {'id': 'q1', 'prompt': 'A ?'},
          {'id': 'q2', 'prompt': 'B ?'},
        ],
      });
      expect(qs, hasLength(2));
      expect(qs.first['id'], 'q1');
    });

    test('tolère l\'absence ou un type inattendu', () {
      expect(parseQuestions({}), isEmpty);
      expect(parseQuestions({'questions': 'nope'}), isEmpty);
    });

    test('ignore les entrées non-objet', () {
      expect(
        parseQuestions({
          'questions': [
            {'id': 'q1'},
            'bruit',
            42,
          ],
        }),
        hasLength(1),
      );
    });
  });
}
