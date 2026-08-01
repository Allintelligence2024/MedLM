// Tests audit P1-2 — normalisation du score d'examen.
//
// Le backend renvoie tantôt un ratio 0..1, tantôt un pourcentage déjà
// calculé selon l'endpoint. Afficher « 1 % » à un étudiant qui a tout
// juste serait un bug mémorable.
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/ui/exams/exam_result_screen.dart';

void main() {
  group('scorePercent', () {
    test('interprète un ratio 0..1', () {
      expect(ExamResultScreen.scorePercent({'score': 0.75}), 75);
      expect(ExamResultScreen.scorePercent({'score': 1.0}), 100);
      expect(ExamResultScreen.scorePercent({'score': 0.0}), 0);
    });

    test('interprète un pourcentage déjà calculé', () {
      expect(ExamResultScreen.scorePercent({'score': 75}), 75);
      expect(ExamResultScreen.scorePercent({'score_percent': 88}), 88);
    });

    test('arrondit au plus proche', () {
      expect(ExamResultScreen.scorePercent({'score': 0.666}), 67);
      expect(ExamResultScreen.scorePercent({'score': 0.334}), 33);
    });

    test('borne à 0..100', () {
      expect(ExamResultScreen.scorePercent({'score': 150}), 100);
      expect(ExamResultScreen.scorePercent({'score': -5}), 0);
    });

    test('0 si le score est absent ou d\'un type inattendu', () {
      expect(ExamResultScreen.scorePercent(const {}), 0);
      expect(ExamResultScreen.scorePercent({'score': 'excellent'}), 0);
    });
  });

  group('passed', () {
    test('le verdict explicite du serveur prime', () {
      // Le seuil de réussite est une décision métier : si le serveur
      // la prend, le client ne la recalcule pas.
      expect(ExamResultScreen.passed({'score': 0.2, 'passed': true}), isTrue);
      expect(ExamResultScreen.passed({'score': 0.9, 'passed': false}), isFalse);
    });

    test('à défaut, seuil de 50 %', () {
      expect(ExamResultScreen.passed({'score': 0.5}), isTrue);
      expect(ExamResultScreen.passed({'score': 0.49}), isFalse);
    });
  });
}
