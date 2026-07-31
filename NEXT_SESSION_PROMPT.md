# Prompt pour la prochaine conversation — Suite MedAnki DZ

## Contexte

Tu es un agent de code (Arena.ai Agent Mode) qui continue le projet
**MedAnki DZ v2** (application d'apprentissage médical SRS pour les
étudiants en médecine algériens).

**Repo** : https://github.com/Allintelligence2024/MedLM
**Branche principale** : main (PR #2 mergé, commit 43ac7f9)
**Phase 18 livrée** : branche arena/019fb521-medlm (PR #3 à merger)

## État actuel (Phases 4-17 + limites 18 + Phase 18 IA)

**Phases 4 à 17 mergées dans main** (PR #2, 17 commits squashés,
~280 fichiers, +18k lignes, 200+ tests). La **Phase 18 (IA)** est
livrée sur arena/019fb521-medlm : 6 sous-phases, 6 commits, ~130
tests supplémentaires, 4 migrations (0012-0015).

### Phase 18 — ce qui est livré

| Sous-phase | Contenu | Endpoint(s) | Statut |
|---|---|---|---|
| 18.1 | Hints adaptatifs (règles SRS, sans LLM) | `GET /v1/ai/hints/:cardId` | ✅ |
| 18.2 | Génération de cartes LLM (provider-agnostic, mock par défaut) | `POST /v1/content/ai-generate` | ✅ |
| 18.3 | Voice-to-card (dictée → draft, STT client ou Whisper) | `POST /v1/ai/voice-to-card` | ✅ |
| 18.4 | Adaptive learning (FSRS ajusté + signaux auteur) | `GET /v1/ai/adaptive/profile`, `GET/POST /v1/ai/adaptive/signals*` | ✅ |
| 18.5 | Détection de décrochage (FCM/APNs, 8h-22h) | `GET/POST /v1/ai/retention/{preview,scan}` | ✅ |
| 18.6 | Voice tutoring (disclaimer obligatoire, audit append-only) | `POST /v1/ai/tutor/ask` | ✅ |

### Nouveaux fichiers Phase 18

```
backend/src/ai/
├── ai.module.ts               (AiModule monté dans app.module.ts)
├── llm/                       (LlmProvider : mock déterministe | http OpenAI-compatible)
├── hints/                     (7 catégories × 3 langues, profil dérivé du SRS)
├── generate/                  (quota 20/j, throttle, drafts, audit)
├── voice/                     (3 règles de formatage dictée → carte)
├── adaptive/                  (fenêtre 30 j, w11×1.15 fragile / w8×1.05 fort, signaux)
├── retention/                 (gentle 3j / streak_broken 5j / reengagement 10j, anti-spam)
└── tutor/                     (disclaimer invariant, urgences SAMU 115, anti-injection)

backend/src/db/schema/ai.ts    (ai_generation_jobs, ai_difficulty_signals,
                                retention_alerts, ai_tutor_prompts)
backend/src/db/migrations/0012..0015 (0015 = append-only + triggers)

backend/test/unit/             (ai_hints, ai_generate, voice_to_card,
                                ai_adaptive, ai_retention, ai_tutor — ~130 cas)

PHASE_18_1..6_RAPPORT.md       (6 rapports de sous-phase)
```

### Config IA (backend/.env.example)

```
AI_LLM_PROVIDER=mock|http      AI_LLM_BASE_URL/API_KEY/MODEL
AI_TRANSCRIBER_PROVIDER=mock|http  AI_TRANSCRIBER_BASE_URL/API_KEY/MODEL
AI_GENERATE_DAILY_QUOTA=20  AI_VOICE_DAILY_QUOTA=50  AI_TUTOR_DAILY_QUOTA=30
```

## CE QUE TU DOIS FAIRE (Phase 19+)

### Phase 19 — Production launch (3+ mois)

* Merger la PR #3 (Phase 18) si pas encore fait.
* Seed étendu : histologie, embryologie, biophysique (JSON dans
  mobile/assets/content, conformité Content Policy +
  tools/validate_content.py).
* Localisation AR complète (RTL, traductions — i18n Phase 17.5 posé).
* Application mobile des poids FSRS ajustés (18.4 exposés, moteur
  Dart + golden tests de parité à mettre à jour).
* UI mobile des endpoints 18.x : HintBanner, dictée vocale
  (speech_to_text), chat tuteur (STT/TTS), écran signaux CMS.
* CronJob K8s `retention-cronjob.yaml` (09:30 / 18:30 → POST
  /v1/ai/retention/scan).
* Penetration testing externe, bug bounty.
* App store submission (iOS + Android).
* Marketing site + landing page.

### Phase 20 — Scale (6+ mois)

* Multi-régions (Alger, Oran, Constantine).
* GraphQL gateway (remplacement progressif de REST).
* ML pipeline (prédictions de scores mock exam, ajustement par tag).
* Partenariats facultés.

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
bash tools/scripts/phase13_checks.sh
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
