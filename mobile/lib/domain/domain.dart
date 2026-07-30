/// Façade publique de la couche domaine.
///
/// On importe `domain.dart` plutôt que les fichiers分散, ce qui donne un
/// point unique de migration (par exemple, le jour où la couche domaine
/// sera ré-implémentée en arrière-plan par du code généré).
library;

export 'entities/entities.dart';
export 'repositories/repositories.dart';
export 'usecases/build_study_queue.dart';
export 'usecases/download_deck.dart';
export 'usecases/fetch_due_cards.dart';
export 'usecases/record_review.dart';
export 'usecases/start_mock_exam.dart';
export 'usecases/submit_report.dart';
export 'usecases/sync_outbox.dart';
export 'usecases/validate_entitlement.dart';
