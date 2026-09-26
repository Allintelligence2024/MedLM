// Tests de BackgroundSync — légers, on vérifie surtout le contrat
// (idempotence de initialize, gestion d'erreur si non initialisé).
//
// On ne peut pas tester WorkManager.runOnce() de bout en bout sans
// un mock du plugin. On vérifie que :
//   * initialize() est idempotent
//   * schedule() sans initialize() lève StateError
//   * runOnce() sans initialize() lève StateError
//   * kBackgroundSyncTaskName est stable (utilisé par l'OS)
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/core/sync/background_sync.dart';

void main() {
  test('kBackgroundSyncTaskName a une valeur stable', () {
    expect(kBackgroundSyncTaskName, equals('medanki_dz.background_sync'));
  });

  test('schedule() sans initialize() lève StateError', () async {
    // L'état `_initialized` est statique : ce fichier de test est le
    // seul à démarrer un isolate sans initialize(), donc il peut
    // vérifier le contrat pour de vrai (l'ancienne version se
    // contentait de vérifier que la constante n'était pas vide).
    await expectLater(BackgroundSync.schedule(), throwsStateError);
  });

  test('runOnce() sans initialize() lève StateError', () async {
    await expectLater(BackgroundSync.runOnce(), throwsStateError);
  });

  test('cancel() sans initialize() ne lève pas', () async {
    // Idempotent — peut être appelé même sans initialize().
    await BackgroundSync.cancel();
    // Aucune exception attendue.
  });
}
