# Phase 6 — Mobile et qualification de livraison (R13, R14)

Date : 2026-09-27. Branche : `arena/01a0defd-medlm`.
Décision inchangée : **NO-GO**. Pas d'appareil physique, pas de GO.

## Ce qui est fait ici

- **R13 (CI / docs)** — Drift est généré dans le job `mobile` de
  `backend-ci.yml` (`build_runner` + existence de
  `app_database.g.dart`). README corrigé : le fichier généré **n'est
  pas** commité ; les workflows `mobile-ci.yml` / `cms-ci.yml` /
  `guards.yml` **n'existent pas**. APK debug déjà produit en CI
  (preuve historique `36319139969` et suivantes).
- **R14** — reformulation des surfaces produit : README, landing
  `site/`, fiches `store/play` et `store/apple` (FR/EN/AR). Suppression
  des chiffres non démontrés (697 cartes, 10 decks), des partenariats
  faculté, de la « validation scientifique », du chiffrement bout en
  bout et du tuteur médical. Disclaimer : outil de révision, pas un
  avis médical.

## Ce qui reste manuel

- Tests appareil : login, achat sandbox, téléchargement, stockage
  protégé, expiration/grâce, hors-ligne, multi-appareil, reprise.
- Revue humaine du contenu pédagogique s'il est diffusé.
- Vérification indépendante d'abus et décision GO.

Sans ces trois points, R13 reste `in_progress`. R14 est fermé **sur
la reformulation** : les promesses ont été retirées plutôt que
« validées ».

## Non-revendications

- Pas de GO. Pas de SHA de release store. Pas de parcours vertical
  mobile hors CI.
- `flutter create` génère l'hôte Android en CI : le dossier
  `mobile/android/` n'est pas versionné.
