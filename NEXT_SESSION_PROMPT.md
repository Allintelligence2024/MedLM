# Prompt pour la prochaine conversation — Suite MedAnki DZ

## Contexte

Tu es un agent de code (Arena.ai Agent Mode) qui continue le projet
**MedAnki DZ v2** (application d'apprentissage médical SRS pour les
étudiants en médecine algériens).

**Repo** : https://github.com/Allintelligence2024/MedLM
**Branche principale** : main (PR #2 mergé 43ac7f9, PR #3 mergé 4fe5437,
PR #4 mergé 996ebb7)
**Branche session** : arena/019fbd6a-medlm (Phase 19.5-19.7 livrées, PR #5)

## État actuel (Phases 4-18 + Phase 19 quasi complète)

**Phases 4 à 18 mergées dans main.** La **Phase 19** (production
launch) est presque bouclée :

| Sous-phase | Contenu | Statut |
|---|---|---|
| 19.1 | Seed étendu : histologie (30), embryologie S1-8 (30), biophysique membranes (30) → 10 decks, 697 cartes | ✅ mergé |
| 19.2 | CronJob K8s rétention (2 scans/jour 09:30 & 18:30 Alger, POST /v1/ai/retention/scan) | ✅ mergé |
| 19.3 | i18n FR/AR/EN complète des clés IA (15 clés × 3, parité testée, source unique disclaimer) | ✅ mergé |
| 19.4 | SECURITY.md — politique sécurité + bug bounty (SLA, barème DZD, safe harbor lois 09-04/18-07) | ✅ mergé |
| 19.5 | UI mobile des endpoints IA : HintBanner, dictée vocale (ports STT), chat tuteur (STT/TTS, disclaimer servi), signaux auteur CMS `/admin/signals` | ✅ PR #5 |
| 19.6 | Poids FSRS ajustés côté moteur Dart : `fsrs_adaptive.dart` (miroir backend w11×1.15 / w8×1.05, bornes 0.5×-2×) + golden tests de parité (8 cas + 2 séquences, 855 valeurs cross-check) | ✅ PR #5 |
| 19.7 | Landing page statique trilingue (site/, 61 clés × 3, FR inliné, zéro tracker, check_landing.py bloquant) | ✅ PR #5 |
| 19.8 | Pen test externe (canal = SECURITY.md §1) + app stores iOS/Android | ⏳ reste (opérationnel) |

### Phase 18 — ce qui est livré

| Sous-phase | Contenu | Endpoint(s) | Statut |
|---|---|---|---|
| 18.1 | Hints adaptatifs (règles SRS, sans LLM) | `GET /v1/ai/hints/:cardId` | ✅ |
| 18.2 | Génération de cartes LLM (provider-agnostic, mock par défaut) | `POST /v1/content/ai-generate` | ✅ |
| 18.3 | Voice-to-card (dictée → draft, STT client ou Whisper) | `POST /v1/ai/voice-to-card` | ✅ |
| 18.4 | Adaptive learning (FSRS ajusté + signaux auteur) | `GET /v1/ai/adaptive/profile`, `GET/POST /v1/ai/adaptive/signals*` | ✅ |
| 18.5 | Détection de décrochage (FCM/APNs, 8h-22h) | `GET/POST /v1/ai/retention/{preview,scan}` | ✅ |
| 18.6 | Voice tutoring (disclaimer obligatoire, audit append-only) | `POST /v1/ai/tutor/ask` | ✅ |

### Nouveaux fichiers Phase 19.5-19.7 (PR #5)

```
mobile/lib/data/repositories/ai/       (ai_models + ai_repository,
                                        cache hints, offline-first)
mobile/lib/ui/ai/                      (hint_banner, voice_dictation_sheet,
                                        tutor_chat_screen, ai_speech_ports)
mobile/lib/core/srs/fsrs_adaptive.dart (miroir ADAPTIVE_THRESHOLDS backend)
mobile/test/ai/                        (modèles, repository, widgets)
mobile/test/srs/adaptive_golden_test.dart

cms/src/app/admin/signals/page.tsx     (file signaux + scan, rôles author/editor)
cms/src/lib/signals.ts                 (types camelCase = réponse Drizzle)

site/                                  (landing statique trilingue FR/AR/EN)
tools/scripts/check_landing.py         (parité clés, zéro tracker — bloquant
                                        dans phase13_checks.sh)
tools/verify_against_ts_fsrs.js        (+ section adaptive w custom)
tools/cross_check.py                   (+ 378 valeurs adaptatives, 855 total)
tools/dart_parity_check.py             (+ seuils adaptatifs TS↔Dart↔Py)
tools/fsrs_reference.py / generate_golden.py (+ miroir Python + section
                                        adaptive du golden)
```

## CE QUE TU DOIS FAIRE (Phase 19.8 + Phase 20)

### Phase 19.8 — Lancement opérationnel (reste)

* **Pen test externe** : canal = SECURITY.md §1 (bug bounty 19.4) ;
  périmètre conseillé : auth/refresh rotation, wrap-key decks,
  quotas IA, append-only audit (triggers 0015), injection LLM tuteur.
* **App stores** : build signé iOS + Android, fiches store (captures à
  générer depuis un device), privacy labels cohérents avec la FAQ de la
  landing (site/). Brancher alors le formulaire notify :
  `POST /v1/marketing/notify-list` (double opt-in, registre loi 18-07).
* **Branchements réels des ports** `SpeechToTextPort`/`TextToSpeechPort`
  (plugins speech_to_text / flutter_tts au `main()`), sur device.
* Intégrer `HintBanner` + `VoiceDictationSheet` dans l'écran d'étude
  (widgets prêts, écran à finaliser) et la synchro périodique de
  `AdaptiveFsrsParameters` (worker de fond).

### Phase 20 — Scale (6+ mois)

* Multi-régions (Alger, Oran, Constantine).
* GraphQL gateway (remplacement progressif de REST).
* ML pipeline (prédictions de scores mock exam, ajustement par tag).
* Partenariats facultés ; libellés captures d'écran de la landing.

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
bash tools/scripts/phase13_checks.sh    # inclut check_landing.py
# Parité SRS si on touche au moteur :
python3 tools/dart_parity_check.py && python3 tools/generate_golden.py
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
