/// Façade du domaine MedAnki DZ.
///
/// La couche `domain/` (architecture v2 §3) ne dépend ni de Flutter, ni de
/// Drift, ni d'aucun détail d'implémentation. Les classes ici sont
/// **immuables** et **pures** — elles peuvent être testées, sérialisées et
/// réconciliées sans aucun effet de bord.
///
/// Ce fichier est volontairement un simple barrel : il ré-exporte les
/// entités déjà définies dans `core/srs/` et `core/content/`, qui sont elles-
/// mêmes déjà conformes aux contraintes de la couche domaine (aucune
/// annotation de persistance, aucun import Flutter). On évite ainsi la
/// duplication et on garde une source de vérité unique.
library;

export '../../core/srs/review_event.dart' show ReviewEvent, UuidV7;
export '../../core/srs/srs_models.dart'
    show Rating, CardState, CardType, SrsCardState, SchedulingPreview;
