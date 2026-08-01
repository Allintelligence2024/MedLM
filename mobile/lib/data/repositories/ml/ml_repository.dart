// MlRepository — consomme les endpoints ML locaux (Phase 20.3).
//
//   * GET /v1/ml/mock-exam-prediction → MockExamPrediction (union
//     predictible / refus k-anonymat raisonné) ;
//   * GET /v1/ml/tag-focus            → TagFocusResult (focus/relax).
//
// Choix offline-first (identique à AiRepository) : les variantes
// `*OrNull` ne lancent jamais — un écran statistique dégradé ne doit
// pas crasher parce que le réseau algérien a flanché.
library;

import '../../network/api_client.dart';
import 'ml_models.dart';

class MlRepository {
  MlRepository({required this.api});

  final ApiClient api;

  /// Prédiction du score au prochain examen blanc (explicable :
  /// features + version du modèle toujours rendues).
  Future<MockExamPrediction> mockExamPrediction() async {
    final raw = await api.fetchMockExamPrediction();
    return MockExamPrediction.fromJson(raw);
  }

  /// Variante « ne jamais throw » : null = carte masquée (offline,
  /// erreur serveur…). Le widget décide de s'effacer silencieusement.
  Future<MockExamPrediction?> mockExamPredictionOrNull() async {
    try {
      return await mockExamPrediction();
    } catch (_) {
      return null;
    }
  }

  /// Suggestions focus/relax par tag (cap 5 par catégorie côté serveur).
  Future<TagFocusResult> tagFocus() async {
    final raw = await api.fetchTagFocus();
    return TagFocusResult.fromJson(raw);
  }

  /// Variante « ne jamais throw » (cf. [mockExamPredictionOrNull]).
  Future<TagFocusResult?> tagFocusOrNull() async {
    try {
      return await tagFocus();
    } catch (_) {
      return null;
    }
  }
}
