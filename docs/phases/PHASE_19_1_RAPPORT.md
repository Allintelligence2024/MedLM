# Phase 19.1 — Seed étendu : histologie, embryologie, biophysique

> Statut : **terminée**. Le catalogue passe de 7 à 10 decks (607 → 697
> cartes) avec trois disciplines demandées au programme PCEM1/PCEM2
> algérien. Validation 100 % `tools/validate_content.py`.

## Livré

```
mobile/assets/content/
├── deck_histo_epitheliums.json        (30 cartes — histologie des épithéliums)
├── deck_embryo_semaines_1_8.json      (30 cartes — embryologie S1-S8)
└── deck_biophys_membranes.json        (30 cartes — biophysique membranaire)

PHASE_19_1_RAPPORT.md
```

## Contenu des decks

### Histologie des épithéliums (30 cartes)

Classification des 7 types épithéliaux (avec erreurs classiques de
concours), jonctions cellulaires (desmosomes/pemphigus, tight
junctions/BHE, gap junctions/myocarde, hémidesmosomes/épidermolyses),
spécialisations apicales (microvillosités, cils 9+2/Kartagener,
stéréocils), glandes (méro/apo/holocrine, sébacée/acné), pathologie
(métaplasie vs dysplasie, cytokératines CK7/CK20).

### Embryologie semaines 1 à 8 (30 cartes)

Fécondation → implantation (GEU, hCG), disque bilaminaire,
gastrulation et 3 feuillets (avec destinées), neurulation
(neuropores J25/J27, acide folique), crêtes neurales
(neurocristopathies), cardiogenèse (looping, foramen ovale,
tétralogie de Fallot), arcades/poches pharyngiennes (DiGeorge),
organogenèse (foie, reins, membres AER/ZPA-SHH), shunts fœtaux.

### Biophysique des membranes (30 cartes)

Bicouche et cholestérol, loi de Fick/DLCO, transport actif
(Na/K ATPase, SGLT/gliflozines), Nernst/GHK (hyperkaliémie),
potentiel d'action (canaux Na 3 états, TTX, lidocaïne), osmose
et Starling (œdèmes), aquaporine-2/lithium, signaling (cAMP/
toxine cholérique), digitaliques, patch-clamp, Poiseuille.

## Conformité Content Policy (validate_content.py)

| Règle | État |
|---|---|
| FR obligatoire (front/back/explanation) | ✅ 90/90 |
| EN fourni sur tous les champs | ✅ |
| `source_meta` complète (`original`, fac, année) | ✅ |
| Difficulty hints 1→5 progressifs | ✅ |
| IDs uniques par deck (`histo_epith_###`…) | ✅ |
| Aucune carte retirée de la distribution | ✅ |
| **Total : 722 vérifications — 10 decks, 697 cartes** | ✅ |

## Choix d'autorité

* **Qualité médicale > volume** : 30 cartes/deck relues pour la
  précision (conventions PCEM algérien, références cliniques).
* `is_premium: true` homogène avec le catalogue Anatomie.
* `difficulty_hint` 1-5 calibré (1 = rappel de cours, 5 = point
  de concours fin, ex. inactivation du canal Na).
* Chaque explanation relie la carte à une situation clinique —
  fidèle à la vocation "apprendre en contexte" de MedAnki DZ.

## Hors périmètre (reporté)

* Migration des maths en `\(...\)` LaTeX pour les formules (Fick,
  Nernst, Poiseuille) — le rendu mobile reste texte brut pour
  l'instant.
* Suites thématiques (histologie des glandes endocrines,
  embryologie S9+, biophysique du muscle) — prochain lot de seed.
* Illustrations (schémas membranes) : le champ `media` est prêt,
  l'asset pipeline Phase 11bis (R2) les accueillera.
