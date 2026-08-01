# Contenu archivé — hors bundle

Ce dossier **n'est pas déclaré** dans `pubspec.yaml` : rien de ce qu'il
contient n'est compilé dans l'application.

| Fichier | Pourquoi il est ici |
|---|---|
| `deck_anatomie_ancien_demo.json` | Deck de démonstration de 4 cartes (`is_demo: true`), vestige des premières phases. Il était livré en production au milieu des decks réels (audit **P2-4**). Conservé pour l'historique éditorial, plus jamais servi. |

`tools/scripts/check_bundle_assets.py` vérifie à chaque exécution des
gardes qu'aucun contenu de démonstration ne réapparaît dans
`assets/content/` et que ce dossier reste hors du bundle.
