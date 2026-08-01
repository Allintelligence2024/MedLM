// AdaptiveParamsCache — persistance locale des poids FSRS adaptatifs
// servis par GET /v1/ai/adaptive/profile (Phase 18.4/19.6).
//
// Pourquoi un cache dédié (table user_prefs) ?
//   * le worker de fond (BackgroundSyncService) rafraîchit les poids
//     périodiquement — l'écran d'étude ne doit PAS attendre un round-
//     trip réseau à chaque session (réseau algérien intermittent) ;
//   * un refresh en foreground est déclenché seulement si le cache est
//     plus vieux que [AdaptiveParamsCache.defaultTtlMs].
//
// Contrat : ce cache est la moitié « transport/stockage » de
// l'adaptatif. L'APPLICATION des poids au moteur de planification
// arrive avec la phase dédiée — le moteur reste aux poids par défaut
// tant que la phase n'est pas livrée (doc v2 §13 : pas de dérive
// silencieuse). La validité (19 poids, tous > 0, bornage 0.5×–2×) est
// revérifiée à la LECTURE via FsrsAdaptive.parametersFromAdjustment :
// une donnée corrompue retombe sur le moteur par défaut, jamais sur
// un état invalide.
library;

import 'dart:convert';

import '../../../core/srs/fsrs_adaptive.dart';
import '../../../core/srs/fsrs_parameters.dart';
import '../../local/app_database.dart';
import 'ai_repository.dart';

/// Clé user_prefs réservée (préfixée pour ne pas entrer en collision
/// avec les prefs gamification).
const String kAdaptiveParamsPrefKey = 'ai.adaptive_fsrs_params';

/// Entrée de cache : poids adaptatifs servis + métadonnées
/// d'explicabilité (v2 §13) et de fraîcheur.
class CachedAdaptiveParams {
  const CachedAdaptiveParams({
    required this.parameters,
    required this.fetchedAtMs,
    required this.active,
    required this.reasons,
  });

  /// Poids déjà bornés côté serveur ET client (double défense).
  final FsrsParameters parameters;

  /// Timestamp epoch-ms de la récupération (fraîcheur → TTL).
  final int fetchedAtMs;

  /// true si des poids ont réellement été ajustés (changedIndices
  /// non vide côté serveur) — sinon le cache vaut le défaut.
  final bool active;

  /// Justification explicable de l'ajustement (servie, jamais
  /// régénérée côté client).
  final List<String> reasons;
}

class AdaptiveParamsCache {
  AdaptiveParamsCache({required this.db, this.ttlMs = defaultTtlMs});

  static const int defaultTtlMs = 6 * 60 * 60 * 1000; // 6 h

  final AppDatabase db;
  final int ttlMs;

  /// Lecture défensive : null si absent OU corrompu — l'appelant
  /// retombe alors sur le moteur par défaut (ou rafraîchit).
  Future<CachedAdaptiveParams?> read({String userId = 'local'}) async {
    final rows = await (db.select(db.userPrefs)
          ..where(($t) => $t.userId.equals(userId) & $t.key.equals(kAdaptiveParamsPrefKey)))
        .get();
    if (rows.isEmpty) return null;
    return decodeAdaptiveParams(rows.first.value);
  }

  Future<void> write(CachedAdaptiveParams entry, {String userId = 'local'}) {
    return db.into(db.userPrefs).insertOnConflictUpdate(
          UserPrefsCompanion.insert(
            userId: userId,
            key: kAdaptiveParamsPrefKey,
            value: encodeAdaptiveParams(entry),
          ),
        );
  }

  Future<void> clear({String userId = 'local'}) {
    return (db.delete(db.userPrefs)
          ..where(($t) => $t.userId.equals(userId) & $t.key.equals(kAdaptiveParamsPrefKey)))
        .go();
  }

  /// Fraîcheur : true si l'entrée doit être rafraîchie à [nowMs].
  bool isStale(int fetchedAtMs, int nowMs) => nowMs - fetchedAtMs >= ttlMs;

  // ── Sérialisation (pure, testable sans base) ──────────────────────

  /// Format versionné : {"v":1,"fetched_at":ms,"weights":[…19…],
  /// "active":bool,"reasons":[…]}. Le champ `v` permettra une
  /// migration explicite si le format évolue.
  static String encodeAdaptiveParams(CachedAdaptiveParams entry) {
    return jsonEncode(<String, Object?>{
      'v': 1,
      'fetched_at': entry.fetchedAtMs,
      'weights': entry.parameters.weights,
      'active': entry.active,
      'reasons': entry.reasons,
    });
  }

  /// Parse défensif : TOUT problème (JSON invalide, version inconnue,
  /// poids invalides) renvoie null — jamais d'exception, jamais de
  /// paramètres hors bornes injectés dans le moteur.
  static CachedAdaptiveParams? decodeAdaptiveParams(String raw) {
    try {
      final j = jsonDecode(raw);
      if (j is! Map || j['v'] != 1) return null;
      final weights = ((j['weights'] as List?) ?? const [])
          .map((e) => (e as num).toDouble())
          .toList();
      // Revérification complète à la lecture (bornage inclus) —
      // parametersFromAdjustment retourne le défaut si invalide.
      final params = FsrsAdaptive.parametersFromAdjustment(
        _WeightsView(weights),
      );
      final fetchedAt = ((j['fetched_at'] as num?) ?? 0).toInt();
      return CachedAdaptiveParams(
        parameters: params,
        fetchedAtMs: fetchedAt,
        active: (j['active'] as bool?) ?? false,
        reasons: ((j['reasons'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
      );
    } catch (_) {
      return null;
    }
  }
}

/// Vue minimale exposant `weights` pour FsrsAdaptive (qui accepte
/// tout objet de cette shape — découplage volontaire).
class _WeightsView {
  const _WeightsView(this.weights);
  final List<double> weights;
}

/// Rafraîchit le cache depuis GET /v1/ai/adaptive/profile.
///
/// Best-effort TOTAL : aucune exception ne remonte (offline, 429,
/// flag OFF…) — retourne true si l'entrée a été (ré)écrite.
///
/// Utilisé par le worker de fond (BackgroundSyncService) et comme
/// refresh opportuniste au démarrage d'une session d'étude.
Future<bool> refreshAdaptiveFsrsParameters({
  required AiRepository ai,
  required AdaptiveParamsCache cache,
  int? nowMs,
  String userId = 'local',
}) async {
  try {
    final profile = await ai.adaptiveProfile();
    await cache.write(
      CachedAdaptiveParams(
        parameters:
            FsrsAdaptive.parametersFromAdjustment(profile.fsrsAdjustment),
        fetchedAtMs: nowMs ?? DateTime.now().millisecondsSinceEpoch,
        active: profile.fsrsAdjustment.active,
        reasons: profile.fsrsAdjustment.reasons,
      ),
      userId: userId,
    );
    return true;
  } catch (_) {
    return false;
  }
}
