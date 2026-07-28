# ✅ Phase 1 — Fondations SRS (FSRS-5 réel)

> Statut : **terminée**, en attente de validation avant la Phase 2.
> Voie retenue : **A — Flutter/Dart** (nouveau dossier `mobile/`).

---

## 1. Ce qui a été livré

```
mobile/
├── pubspec.yaml
├── analysis_options.yaml
└── lib/core/srs/
    ├── fsrs_parameters.dart    115 l.  19 poids w[], constantes, config
    ├── srs_models.dart         218 l.  Rating, CardState, CardType, SrsCardState
    ├── review_event.dart       159 l.  ReviewEvent append-only + UUID v7
    └── fsrs_engine.dart        351 l.  moteur pur : applyReview, preview, fold

mobile/test/srs/
├── golden_scenarios.json       31 scénarios / 139 étapes (généré)
├── golden_test.dart            323 l.  vérifie chaque étape valeur par valeur
└── fold_properties_test.dart   355 l.  déterminisme, sync multi-appareils

tools/
├── fsrs_reference.py           implémentation de référence (miroir du Dart)
├── generate_golden.py          génère les scénarios golden
├── verify_against_ts_fsrs.js   extrait les valeurs de ts-fsrs (primitives)
├── verify_sequences_ts.js      extrait les valeurs de ts-fsrs (séquences)
├── cross_check.py              601 primitives comparées
├── cross_check_sequences.py    275 grandeurs comparées
├── dart_parity_check.py        garde-fou Dart / référence
└── verify_all.sh               lance toute la chaîne
```

## 2. Le moteur

**Formules FSRS-5 complètes**, plus aucune heuristique :

| Élément | Implémentation |
|---|---|
| Poids | les 19 paramètres `w[0..18]` officiels |
| Courbe d'oubli | `R(t,S) = (1 + F·t/S)^-0.5`, `F = 19/81` |
| Intervalle | `I = S/F · (requestRetention^(1/DECAY) - 1)`, rétention cible paramétrable |
| Difficulté | `D0(G)`, amortissement linéaire, retour à la moyenne (`w7`) |
| Stabilité rappel | `S'` avec pénalité Hard (`w15`) et bonus Easy (`w16`) |
| Stabilité oubli | `S'_forget` + borne court terme `S/e^(w17·w18)` |
| Stabilité court terme | `S·e^(w17·(G-3+w18))` en phase d'apprentissage |
| Machine à états | NEW → LEARNING → REVIEW ⇄ RELEARNING, paliers 1/6/10 min |
| Leech | drapeau à 8 lapses |
| QCM | gain de stabilité pondéré à 0.85 (reconnaissance < rappel actif) |

**`fold(events)` — la règle d'or de l'architecture v2**, avec quatre garanties testées :
déterminisme, indépendance à l'ordre d'insertion, idempotence face aux doublons,
exclusion des revues en mode examen.

**Pureté totale** : aucune lecture d'horloge, de stockage ou de réseau dans le
moteur — `nowMs` est toujours un paramètre. C'est ce qui rend le `fold`
rejouable et la synchronisation réconciliable.

## 3. Vérification — 876 valeurs comparées à la bibliothèque officielle

Le sandbox n'a pas de SDK Dart. Plutôt que de me contenter d'une auto-référence,
j'ai installé **`ts-fsrs` 4.7.1** — la bibliothèque officielle FSRS que
l'architecture v2 impose au backend (§12) — et comparé mon implémentation à elle.

```
601 primitives comparées à ts-fsrs        ✅ équivalence totale (tolérance 1e-8)
275 grandeurs sur 11 séquences complètes  ✅ identiques au planificateur officiel
Parité Dart / référence                   ✅ poids, formules, pureté, invariants
```

Cette vérification a **trouvé trois vrais bugs** dans ma première version :

1. **Clamp mal placé** — j'appliquais la borne court terme *dans* la primitive
   `next_forget_stability`, alors que ts-fsrs l'applique au niveau du
   planificateur. 23 divergences.
2. **Mauvaise difficulté** — je calculais la nouvelle stabilité avec la
   difficulté *déjà mise à jour* au lieu de celle d'avant la revue. Biais
   systématique sur **tous** les intervalles (ex. 14.233 au lieu de 14.217, et
   jusqu'à +12 % sur les cartes mûres).
3. **Branche « même jour » parasite** — j'utilisais la stabilité court terme
   pour les revues du même jour en état REVIEW ; ts-fsrs n'a pas ce cas
   particulier (R = 1 suffit à annuler le gain). Écart de 4.39 → 0.

C'est précisément l'intérêt d'avoir fait cette vérification maintenant : ces
trois bugs étaient invisibles à l'œil nu et auraient corrompu la progression de
tous les utilisateurs, sans possibilité de rattrapage.

## 4. Tests écrits (à exécuter en CI)

`golden_test.dart` et `fold_properties_test.dart` couvrent :

- les 31 scénarios golden, **étape par étape**, sur 10 champs d'état ;
- les primitives mathématiques (43 sondes) ;
- les invariants : `R(0)=1`, `R(S)=0.9`, décroissance stricte, `D ∈ [1,10]`,
  `S > 0`, `reps`/`lapses` monotones ;
- l'ordre `Again ≤ Hard ≤ Good ≤ Easy` et `S(Hard) < S(Good) < S(Easy)` ;
- l'effet d'espacement (réviser plus tard renforce davantage) ;
- le déterminisme du `fold` sur **100 journaux pseudo-aléatoires**, mélangés et
  inversés ;
- la fusion de deux appareils hors ligne : commutativité et **zéro revue perdue** ;
- les revues simultanées départagées de façon stable (tri sur `(reviewedAt, id)`) ;
- l'UUID v7 : format RFC, ordre lexicographique = ordre chronologique,
  0 collision sur 10 000 tirages ;
- l'aller-retour JSON de `ReviewEvent` et le gel des valeurs du protocole.

> ⚠️ **Limite honnête** : le SDK Dart n'est pas installable dans ce sandbox
> (`storage.googleapis.com` bloqué). Les tests Dart sont écrits mais **n'ont pas
> été exécutés**. La logique qu'ils vérifient l'a été, elle, via la référence
> Python équivalente à ts-fsrs. Il faut lancer `cd mobile && dart test` sur un
> poste disposant du SDK — ce sera automatisé en Phase 12.

## 5. Écarts assumés par rapport au document v2

| Point | Décision |
|---|---|
| Paliers d'apprentissage | 1 min / 6 min / 10 min — choix produit MedAnki DZ, volontairement différent des valeurs par défaut de ts-fsrs. Les intervalles en jours, eux, sont identiques. |
| Pondération QCM | Le doc dit « weight FSRS 0.85 » sans préciser où. J'applique la pondération au **gain** de stabilité, pas à la stabilité absolue : un QCM réussi progresse, mais moins qu'un rappel actif. L'événement reste intact dans le journal. |
| `enableQcmWeighting` | Rendu désactivable, pour pouvoir mesurer son effet réel sur cohorte (Phase 12). |

## 6. Ce qui reste hors périmètre de cette phase

Conformément au plan, **rien d'autre n'a été touché** : l'app Android existante
est intacte, il n'y a encore ni base de données, ni interface, ni réseau.
La Phase 2 (persistance Drift, outbox, migrations) s'appuiera sur ces modèles.

---

## Comment vérifier

```bash
./tools/verify_all.sh          # chaîne complète
cd mobile && dart test         # sur un poste avec le SDK Dart
```
