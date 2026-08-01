# Phase 19.6 — Poids FSRS ajustés dans le moteur Dart + golden tests de parité

> Statut : **terminée**. Le moteur SRS mobile applique désormais les
> poids FSRS personnalisés (Phase 18.4) exactement comme le backend, en
> ligne (profil servi) comme hors-ligne (calcul local), avec verrous de
> parité à trois niveaux.

## Livré

```
mobile/lib/core/srs/fsrs_adaptive.dart   (NOUVEAU — miroir ligne à ligne
   de adaptive.service.ts : seuils, facteurs w11×1.15 / w8×1.05,
   bornage [0.5×, 2×], reasons explicables)

mobile/lib/data/repositories/ai/ai_repository.dart
   + adaptiveProfile()           → GET /v1/ai/adaptive/profile
   + adaptiveFsrsParameters()    → FsrsParameters bornés (défense en
                                   profondeur côté client)

tools/fsrs_reference.py      (+ ADAPTIVE, clamp_adaptive_weights,
                              compute_fsrs_adjustment — miroir Python)
tools/generate_golden.py     (+ section "adaptive" : 8 cas d'ajustement
                              + 2 séquences à poids ajustés)
mobile/test/srs/golden_scenarios.json   (régénéré)
mobile/test/srs/adaptive_golden_test.dart (NOUVEAU — consomme la section)
mobile/test/ai/ai_repository_test.dart  (+ cas « poids servis hors
                              bornes → bornés à 2× »)
tools/verify_against_ts_fsrs.js (+ section adaptive : primitives ts-fsrs
                              rejouées avec w11×1.15 et w8×1.05)
tools/cross_check.py           (+ comparaison de la section adaptive,
                              ~378 valeurs ajoutées)
tools/dart_parity_check.py     (+ check_adaptive_parity : backend TS ↔
                              Dart ↔ Python, une seule vérité numérique)
```

## Architecture

### Deux chemins, un seul résultat

```
Serveur : GET /v1/ai/adaptive/profile
   → FsrsAdjustment.weights (déjà bornés serveur)
   → FsrsAdaptive.parametersFromAdjustment  (bornage défensif ×2)
   → FsrsParams injectés au FsrsEngine local

Hors-ligne : historique local de revues
   → FsrsAdaptive.computeAdjustment(totalReviews, lapseRate)
   → mêmes seuils/facteurs que le backend (parité verrouillée)
```

### Garde-fous anti-dérive (v2 §13)

* Tout poids ajusté reste dans **[0.5×, 2×]** de la base — appliqué
  côté serveur ET côté client (un payload fautif ne peut pas casser le
  SRS d'un étudiant ; test `adaptiveFsrsParameters borne les poids`,
  w8 servi ×10 → retombe à ×2).
* Payload invalide (≠ 19 poids, poids ≤ 0) → retour silencieux aux
  paramètres par défaut.
* Chaque ajustement est **justifié** (`reasons` explicables, mêmes
  chaînes que le backend).

### Verrous de parité à trois niveaux

| Niveau | Vérouillage | Où |
|---|---|---|
| Seuils | ADAPTIVE_THRESHOLDS (TS) = AdaptiveThresholds (Dart) = ADAPTIVE (Py) | `tools/dart_parity_check.py` §5 |
| Séquences | golden rejoués avec poids ajustés (fragile : oubli ; fort : rappel) | `adaptive_golden_test.dart` |
| Primitives | ts-fsrs avec w custom vs référence Python ajustée (855 valeurs) | `cross_check.py` |

## Vérification

```bash
python3 tools/dart_parity_check.py   # ✓ parité (poids + seuils adaptatifs)
python3 tools/generate_golden.py     # ✓ 31 + 2 scénarios régénérés
python3 tools/cross_check.py         # ✓ 855 valeurs (section adaptive incluse)
python3 tools/test_migrations.py     # ✓ 30 vérifs
python3 tools/test_repository_logic.py   # ✓ 20 vérifs
# SDK Dart en CI :
cd mobile && dart test test/srs/     # golden + adaptive_golden
```

## Hors périmètre (reporté)

* **Synchronisation périodique** du profil (worker de fond qui rafraîchit
  les paramètres quand le profil change) — branchée lors de
  l'intégration des écrans d'étude (Phase 19.5 hors périmètre).
* Métriques d'impact de l'ajustement (comparaison intervalles avant /
  après dans les stats) — Phase 20 (ML pipeline).
