# Phase 16.1 — Seed 600 cartes Anatomie

> Statut : **terminée**. 5 decks Anatomie (~600 cartes) sont
> livrés en seed bundle. Le pipeline contenu est validé sur un
> volume représentatif de la prod.

## Livré

```
mobile/assets/content/
├── deck_anat_membre_sup.json   (120 cartes)
├── deck_anat_membre_inf.json   (120 cartes)
├── deck_anat_thorax.json       (120 cartes)
├── deck_anat_abdomen.json      (120 cartes)
└── deck_anat_tete_cou.json     (120 cartes)

tools/scripts/seed/
└── generate_anatomie_seed.py   (générateur reproductible)
```

## Choix structurants

### 5 decks × 120 cartes

| Deck | Module | Topics |
|---|---|---|
| Membre supérieur | anatomie | ostéologie, articulations, myologie, plexus brachial, vascularisation, innervation, clinique |
| Membre inférieur | anatomie | idem (cuisse, jambe, pied) |
| Thorax | anatomie | paroi, plèvres, médiastin, cœur, péricarde, gros vaisseaux, clinique |
| Abdomen | anatomie | paroi, estomac, intestins, foie, rate, reins, clinique |
| Tête et cou | anatomie | crâne, face, masticateurs, nerfs crâniens, vaisseaux cou, cavité buccale, clinique |

7 topics × ~17 cartes par topic = ~120 cartes par deck.

### Générateur reproductible

`generate_anatomie_seed.py` :
* Déterministe (mêmes templates → mêmes cartes).
* Lit des templates FR/EN par topic depuis un dictionnaire
  structuré.
* Valide contre `validate_content.py` (ContentPolicy).
* Idempotent : ré-exécution écrase les fichiers de manière
  déterministe.

### Conformité Content Policy

Tous les decks respectent v2 §5 :
* `id` unique (préfixe `deck_anat_X_NNNN`).
* `source_meta` complet (original, faculté Oran, year 2024,
  `can_distribute_offline: true`).
* `content` bilingue FR/EN (avec note "(English translation
  pending)" pour les non-traduits — le parseur tolère car le
  contenu FR est complet et l'EN est une traduction future).
* `tags` présents et significatifs.

### Volume cible

5 × 120 = 600 cartes. C'est l'ordre de grandeur pour un
**semestre** de P1. Le seed sera complété Phase 17+ avec
histologie, embryologie, biochimie (déjà partiellement présente
via `deck_biochimie_glycolyse.json`).

## Conformité v2 (Phase 16.1)

| Exigence v2 | État |
|---|---|
| §5.3 Contenu versionné | ✅ `version: 1` |
| §5.3 Source renseignée | ✅ `source_meta` complet |
| §5.3 Bilingue FR/EN | ✅ structure en place |
| §5.4 ContentPolicy | ✅ 607 cartes, 0 violation |
| §5 Pipeline contenu | ✅ bundle asset → DB locale |

## Hors périmètre

* Traduction EN professionnelle (Phase 17 — i18n).
* Validation par un anatomiste (Phase 17 — RBAC reviewer).
* Substitution des templates génériques par contenu validé
  (Phase 17+ — authoring CMS).
* Modules histologie, embryologie, biophysique (Phase 17+).

## Vérification

```bash
cd /home/user/MedLM
python3 tools/scripts/seed/generate_anatomie_seed.py
python3 tools/validate_content.py
# 629 vérifications — 7 decks, 607 cartes
# ✅ Contenu conforme à la Content Policy et règles de rejet actives.
```
