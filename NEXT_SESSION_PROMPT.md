# Prompt pour la prochaine conversation — Suite MedAnki DZ

## Contexte

Tu es un agent de code (Arena.ai Agent Mode) qui continue le projet
**MedAnki DZ v2** (application d'apprentissage médical SRS pour les
étudiants en médecine algériens).

**Repo** : https://github.com/Allintelligence2024/MedLM
**Branche principale** : main (PR #2 mergé 43ac7f9, PR #3 mergé 4fe5437,
PR #4 mergé 996ebb7)
**Branche session** : arena/019fbd6a-medlm (Phases 19.5-19.8 + 20.1-20.4
livrées, PR #5)

## État actuel — Phase 19 COMPLÈTE (8/8), Phase 20 COMPLÈTE (4/4)

**Phases 4 à 18 mergées dans main.** Phases 19 et 20 entièrement
livrées sur la branche session (PR #5).

### Phase 19 — production launch

| Sous-phase | Contenu | Statut |
|---|---|---|
| 19.1 | Seed étendu : histologie (30), embryologie S1-8 (30), biophysique membranes (30) → 10 decks, 697 cartes | ✅ mergé |
| 19.2 | CronJob K8s rétention (2 scans/jour 09:30 & 18:30 Alger, POST /v1/ai/retention/scan) | ✅ mergé |
| 19.3 | i18n FR/AR/EN complète des clés IA (15 clés × 3, parité testée, source unique disclaimer) | ✅ mergé |
| 19.4 | SECURITY.md — politique sécurité + bug bounty (SLA, barème DZD, safe harbor lois 09-04/18-07) | ✅ mergé |
| 19.5 | UI mobile des endpoints IA : HintBanner, dictée vocale (ports STT), chat tuteur (STT/TTS, disclaimer servi), signaux auteur CMS `/admin/signals` | ✅ PR #5 |
| 19.6 | Poids FSRS ajustés côté moteur Dart : `fsrs_adaptive.dart` (miroir backend w11×1.15 / w8×1.05, bornes 0.5×-2×) + golden tests de parité (8 cas + 2 séquences, 855 valeurs cross-check) | ✅ PR #5 |
| 19.7 | Landing page statique trilingue (site/, 61 clés × 3, FR inliné, zéro tracker, check_landing.py bloquant) | ✅ PR #5 |
| 19.8 | Fondations du lancement : fiches stores FR/AR/EN (≤80c, 0 promesse médicale), PRIVACY.md trilingue loi 18-07, RELEASE_CHECKLIST.md, pentest_prep.py (6 mesures, `--report` JSON) | ✅ PR #5 |

### Phase 20 — scale

| Sous-phase | Contenu | Statut |
|---|---|---|
| 20.1 | Multi-régions DZ : `common/regions` (alger primary, oran/constantine répliques, Africa/Algiers, routage écritures→primary/lectures→local), `GET /regionz`, overlays K8s `deploy/k8s/overlays/regions/*`, check_regions.py | ✅ PR #5 |
| 20.2 | GraphQL gateway : 5 opérations persistées lecture seule au-dessus de REST (ViewerStats, DeckCatalog, AdaptiveProfile, MockExamTemplates, LeaderboardTop), empreinte normalisée, budget coût 500/h/user, GRAPHQL_ENABLED→503, check_graphql.py | ✅ PR #5 |
| 20.3 | ML pipeline local : prédiction score examen blanc (`GET /v1/ml/mock-exam-prediction`, k-anonymat ≥50 revues/30j, bandes low/moyen) + focus par tag (`GET /v1/ml/tag-focus`, cap 5), ml_eval.py (parité coefficients, MAE 2.93, séparation 38.7 pts) | ✅ PR #5 |
| 20.4 | Partenariats facultés : migration 0016 (index unique partiel 1 actif/faculté), machine d'état (terminated = puit), 10 facultés allow-list, endpoints GET/POST/PATCH, page CMS `/admin/partnerships`, check_partnerships.py | ✅ PR #5 |

### Fondations durcies

- `security_audit.py` : honore les sentinelles de linter
  (`// eslint-disable-next-line no-console`, `// ignore: avoid_print`)
  et ignore les mentions dans les commentaires — audit zéro-bruit.
- `check_syntax_guard.py` : délimiters `(){}[]` équilibrés (Dart +
  Python, 99 fichiers), marqueurs de conflit interdits repo-wide,
  bloquant dans phase13_checks.sh (étape 3/5). TS exclu documenté
  (regex/gabarits imbriqués instrippables sans lexer).
- `tools/verify_all.sh` + `VERIFY.md` : matrice de validation à
  4 niveaux (dont 3b « scale ») — quel script prouve quoi.
- `pentest_prep.py` : périmètre pen test vérifié statiquement
  (rotation tokens, wrap-key, quotas IA, append-only, anti-injection
  LLM, rôle admin rétention) + export `--report` JSON.

## CE QUI RESTE (opérationnel, hors sandbox)

* **Pen test externe** : lançable dès maintenant — canal = SECURITY.md §1,
  périmètre = `python3 tools/scripts/pentest_prep.py --report`.
* **Consoles stores** : ouvrir Play Console / App Store Connect, suivre
  `store/RELEASE_CHECKLIST.md` (fiches prêtes dans `store/`, captures à
  générer depuis un device, build signé). Brancher alors le formulaire
  notify : `POST /v1/marketing/notify-list` (double opt-in, loi 18-07).
* **Branchements réels des ports** `SpeechToTextPort`/`TextToSpeechPort`
  (plugins speech_to_text / flutter_tts au `main()`), sur device.
* Intégrer `HintBanner` + `VoiceDictationSheet` dans l'écran d'étude
  (widgets prêts, écran à finaliser) et la synchro périodique de
  `AdaptiveFsrsParameters` (worker de fond).
* Brancher `DATABASE_READ_URL` vers un réplica régional (le routage
  20.1 retombe sur la primary si absent).
* Consommer côté mobile les endpoints `/v1/ml/mock-exam-prediction` et
  `/v1/ml/tag-focus` (cartes UI à dessiner), puis le gateway GraphQL
  dans le repository Dart (ops persistées, empreintes listées dans
  `backend/src/gateway/README.md`).
* Formulaire CMS de création de partenariat (la page 20.4 est en
  lecture + changement de statut).

### Phase 18 — rappel des endpoints IA livrés

| Sous-phase | Endpoint(s) |
|---|---|
| 18.1 Hints adaptatifs | `GET /v1/ai/hints/:cardId` |
| 18.2 Génération LLM | `POST /v1/content/ai-generate` |
| 18.3 Voice-to-card | `POST /v1/ai/voice-to-card` |
| 18.4 Adaptive learning | `GET /v1/ai/adaptive/profile`, `GET/POST /v1/ai/adaptive/signals*` |
| 18.5 Rétention | `GET/POST /v1/ai/retention/{preview,scan}` |
| 18.6 Voice tutoring | `POST /v1/ai/tutor/ask` |

## RESSOURCES ET CONTRAINTES

### Sandbox

* Pas de Flutter SDK, pas de Docker, pas de PostgreSQL en local.
* Python 3.11 avec pip --break-system-packages disponible.
* node dispo (scripts TS via tsx), pas de npm install.

### GitHub App

* **Limitation** : pas la permission `workflows` → ne JAMAIS créer
  ni pusher `.github/workflows/*.yml`.
* Branche de session Arena : travailler uniquement dessus, jamais
  sur main en direct. PR via `gh pr create`.

### Validation avant push

```bash
python3 tools/scripts/security_audit.py
python3 tools/scripts/generate_lockfiles.py --check
python3 tools/validate_content.py
bash tools/scripts/phase13_checks.sh    # audit + syntax guard + gardes 19/20
# Parité SRS si on touche au moteur :
python3 tools/dart_parity_check.py && python3 tools/generate_golden.py
# Matrice complète : VERIFY.md
```

## STYLE DE TRAVAIL

* Une phase = un lot livrable, testable, mergeable.
* Un commit par sous-phase, message en français, descriptif.
* Rapport `PHASE_*_RAPPORT.md` par sous-phase.
* Réponse en français (commits, rapports, commentaires).
* Provider-agnostic pour tout ce qui touche à l'IA : mock par défaut,
  jamais de clé API dans le code, jamais de donnée perso vers l'extérieur.

## MÉTRIQUES DE SUCCÈS

* Tests : couverture > 80 % sur le code critique (SRS, billing, auth, IA policy).
* Audit : 0 violation critique.
* Latence P95 : < 500 ms.
* Erreur rate : < 1 % (5xx).
* Conformité v2 : sections §1-13 documentées comme livrées.
