# Prompt pour la prochaine conversation — Suite MedAnki DZ

## Contexte

Tu es un agent de code (Arena.ai Agent Mode) qui continue le projet
**MedAnki DZ v2** (application d'apprentissage médical SRS pour les
étudiants en médecine algériens).

**Repo** : `https://github.com/Allintelligence2024/MedLM`
**Branche principale** : `main` (PR #2 mergé, commit `43ac7f9`)
**Branche de travail** : `arena/019fb3b8-medlm` (à recréer)

## État actuel (Phases 4-17 + limites 18)

**Tout a été mergé dans `main`.** 17 commits squashés, ~280 fichiers,
+18k lignes, 200+ tests unitaires. Architecture MedAnki DZ v2 en place.

### Ce qui est livré

| Phase | Contenu | Statut |
|---|---|---|
| 4 | Clean Arch client (domain + use cases + DI) | ✅ mergé |
| 5 | Backend NestJS + PostgreSQL + Drizzle + ts-fsrs 4.7.1 | ✅ mergé |
| 6 | Auth complète + JWT + endpoints protégés | ✅ mergé |
| 7 | Billing (Chargily + Promo) + Entitlement JWT + RBAC + Throttling | ✅ mergé |
| 8 | RestSyncRepository (consomme /v1/srs-sync) + ApiClient Dio | ✅ mergé |
| 9 | Gamification corrigée (XP habitude, streak, badges) | ✅ mergé |
| 10 | Examens (timer server-side) + Notifications (FCM) | ✅ mergé |
| 11 | CMS Next.js (squelette, RBAC côté backend) | ✅ mergé |
| 12 | Observabilité (Sentry + Prometheus) | ✅ mergé |
| 8 bis | Sécurité mobile (AES-256-GCM + WorkManager + JWT RS256) | ✅ mergé |
| 9 bis | Leaderboard hebdo opt-in + UI collection de badges | ✅ mergé |
| 10 bis | Examens (templates paramétrés + scoring pondéré + anti-triche) | ✅ mergé |
| 11 bis | CMS WYSIWYG bilingue + workflow Kanban + R2 + reports | ✅ mergé |
| 12 bis | Infra (OTel + K8s + Helm + health + backup) | ✅ mergé |
| 13 | Fondations (lockfiles + E2E + audit sécurité + load tests) | ✅ mergé |
| 14 | Sécurité avancée (RSA-OAEP + APNs + OTel + anti-triche) | ✅ mergé |
| 15.1-5 | QuickSession, stats, onboarding, offline cache, partage social | ✅ mergé |
| 16.1-4 | Seed 600 cartes Anatomie, Chargily prod, pack groupe, B2B | ✅ mergé |
| 17 | K8s prod + Read replicas + Redis cache + CDN + i18n | ✅ mergé |
| 18 (limites) | CI GitHub Actions + ioredis + jose + modules NestJS | ✅ mergé |

### Structure du repo

```
.
├── mobile/                   # Flutter (Dart)
│   ├── lib/core/             # security, sync, offline, study, anticheat
│   ├── lib/data/             # network (Dio), repositories, local (Drift)
│   ├── lib/domain/           # entities, repositories, usecases
│   ├── lib/ui/               # leaderboard_screen, badges_screen
│   ├── assets/content/       # 7 decks (607 cartes Anatomie)
│   ├── assets/keys/          # RSA public key (DEV)
│   └── test/                 # 30+ tests Dart
├── backend/                  # NestJS 10
│   ├── src/                  # 20+ modules
│   ├── test/unit/            # 80+ tests Vitest
│   ├── scripts/              # generate_entitlement_keys.mjs
│   └── package.json          # ioredis 5.4.1 + jose 5.9.6
├── cms/                      # Next.js 14
│   ├── src/app/admin/        # cards, workflow, reports
│   └── src/components/       # editor, workflow, upload
├── deploy/                   # K8s (Kustomize) + Helm + scripts
├── tools/                    # Python FSRS verification + scripts
├── tests/                    # E2E Playwright + load tests
├── docs/                     # AUDIT_ARCHITECTURE.md + PLAN_IMPLEMENTATION.md
├── PHASE_*_RAPPORT.md        # 29 rapports de phase
└── NEXT_SESSION_PROMPT.md    # ce fichier
```

### Modules backend (20+)

`auth`, `billing`, `content`, `srs-sync`, `exams`, `gamification`,
`notifications` (fcm + apns), `observability` (sentry + metrics + otel),
`deck-keys` (rsa-oaep), `stats`, `onboarding`, `share`, `group-packs`,
`tenants`, `cache` (redis), `db` (read replicas), `i18n`, `rbac`,
`common` (fsrs + throttle), `health`.

### Tables PostgreSQL (10 migrations)

`users`, `user_devices`, `entitlements`, `promo_codes`, `refresh_tokens`,
`programmes`, `modules`, `decks`, `cards`, `card_reports`, `card_versions`,
`review_logs` (append-only), `srs_card_state`, `sync_cursors`,
`study_sessions`, `webhook_events`, `audit_log`, `exam_attempts`,
`exam_questions`, `exam_answers`, `exam_templates`, `exam_attempt_events`
(append-only), `leaderboard_optin`, `user_xp_snapshot`, `badge_unlocks`,
`deck_key_wrapped`, `share_cards`, `group_packs`, `group_pack_members`,
`tenants`, `user_tenants`.

## CE QUE TU DOIS FAIRE (Phase 18+)

### Phase 18 — Intelligence artificielle (6+ mois selon plan)

**Sous-phases à livrer** (en plusieurs commits) :

1. **18.1 — Hints adaptatifs** : pour chaque carte, l'app affiche
   un hint contextuel basé sur le profil de l'utilisateur
   (niveau d'expérience, historique, langue). Doit s'appuyer
   sur la session + le SRS, pas sur un LLM externe (trop cher
   pour le marché algérien).

2. **18.2 — Génération de cartes assistée par LLM** : un
   instructeur peut soumettre un PDF/syllabus, et l'API
   propose des cartes (front/back/explanation). Validation
   humaine obligatoire (review → approved → published).
   Backend : endpoint POST /v1/content/ai-generate avec rate
   limiting strict et audit complet (qui a généré quoi, quand).

3. **18.3 — Voice-to-card** : l'étudiant dicte une question à
   voix haute, l'app la transcrit (Whisper local ou API), la
   formate en carte, et l'enregistre en draft pour révision
   par l'auteur. Très utile pour la prise de notes rapide.

4. **18.4 — Adaptive learning** : le SRS ajuste dynamiquement
   la difficulté perçue (w FSRS) en fonction des patterns
   d'erreur de l'utilisateur. Si l'utilisateur rate toujours
   les mêmes cartes, on remonte un signal à l'auteur.

5. **18.5 — Détection de décrochage** : alertes proactives
   "vous n'avez pas révisé depuis 5 jours, votre streak est
   cassé". Utilise le système de notifications Phase 14
   (FCM/APNs). Respecter la fenêtre 8h-22h (déjà en place).

6. **18.6 — Voice tutoring (chatbot)** : un assistant vocal
   qui répond aux questions médicales. **ATTENTION** :
   conformité stricte — disclaimer obligatoire "ce n'est pas un
   avis médical, consultez un professionnel". À implémenter
   avec un LLM open-source (Mistral, Llama 3) ou une API
   externe (OpenAI, Anthropic) avec audit des prompts.

### Phase 19 — Production launch (3+ mois)

* Seed étendu : histologie, embryologie, biophysique.
* Localisation AR complète (RTL, traductions).
* Penetration testing externe.
* Bug bounty program.
* App store submission (iOS + Android).
* Marketing site + landing page.

### Phase 20 — Scale (6+ mois)

* Multi-régions (Alger, Oran, Constantine).
* GraphQL gateway (remplacement progressif de REST).
* ML pipeline (Prédictions de scores mock exam).
* Partenariats facultés.

## RESSOURCES ET CONTRAINTES

### Sandbox

* Pas de Flutter SDK, pas de Node, pas de Docker, pas de
  PostgreSQL en local.
* Python 3.11 avec pip --break-system-packages disponible.
* `node` est dispo (pour scripts TS via tsx).
* Tu peux générer des lockfiles et tests, mais pas les
  exécuter en CI.

### GitHub App

* **Limitation** : la GitHub App n'a pas la permission
  `workflows`. Les fichiers `.github/workflows/*.yml` ne
  peuvent PAS être pushés directement. Solution :
  - Pousse le code sur la branche `arena/019fb3b8-medlm`
    (créée dans la session précédente).
  - Commite les workflows localement sur une branche
    `arena/019fb3b8-medlm-with-ci` (worktree).
  - Demande à un mainteneur avec la permission `workflows`
    de merger les workflows manuellement.
* PR #2 a été mergé (commit `43ac7f9`). Crée une nouvelle
  PR pour la Phase 18+ (PR #3).

### Validation

Avant de push, lance :
```bash
python3 tools/scripts/security_audit.py
python3 tools/scripts/generate_lockfiles.py --check
python3 tools/validate_content.py
bash tools/scripts/phase13_checks.sh
```

### Tests

200+ tests unitaires existants. Chaque nouvelle phase doit
ajouter au moins ses propres tests. Les tests Vitest ne sont
pas exécutés localement (pas de npm install) — ils seront
exécutés par la CI après que les workflows soient mergés.

## FICHIERS DE RÉFÉRENCE À CONSULTER

* `PLAN_IMPLEMENTATION.md` — plan complet des 18 phases.
* `AUDIT_ARCHITECTURE.md` — audit initial, base de référence.
* `PHASE_*_RAPPORT.md` (29 fichiers) — historique détaillé.
* `backend/src/` — structure NestJS complète.
* `mobile/lib/` — structure Flutter.
* `deploy/k8s/overlays/prod/` — K8s prod hardened.
* `tools/` — scripts Python de validation SRS.

## STYLE DE TRAVAIL

* **Une phase = un lot livrable, testable, mergeable.**
* **Un commit par sous-phase**, message en français, descriptif.
* **Phase 18+ utilise le pattern suivant** :
  1. Comprendre le scope (sous-phase précise).
  2. Identifier les fichiers à créer/modifier.
  3. Coder (backend NestJS, mobile Flutter, ou les deux).
  4. Ajouter les tests.
  5. Commit + push.
  6. Demander à l'utilisateur de confirmer avant la sous-phase
     suivante (sauf s'il a demandé "all sous-phases").
* **Réponse en français** (commits, rapports, commentaires).

## QUESTIONS À POSER À L'UTILISATEUR

Avant de commencer, demande :

1. **Quelle sous-phase 18.x en premier ?** (18.1 hints
   adaptatifs, 18.2 génération LLM, 18.3 voice-to-card, etc.)
2. **Backend seul, mobile seul, ou les deux ?**
3. **Y a-t-il un LLM à utiliser ?** (OpenAI, Anthropic, Mistral
   local, ou placeholder pour l'instant ?)
4. **L'IA est-elle un "nice to have" ou critique pour le
   lancement ?**

Si l'utilisateur ne répond pas explicitement, propose un
**plan par défaut** :
- 18.1 hints adaptatifs (backend pur, pure logique, rapide à
  implémenter, dépendances externes minimales).
- 18.2 génération LLM (backend + CMS UI, requiert un LLM).
- 18.5 détection de décrochage (utilise FCM/APNs déjà en place).

Et démarre par 18.1.

## MÉTRIQUES DE SUCCÈS

* Tests : couverture > 80% pour le code critique (SRS, billing,
  auth).
* Audit : 0 violation critique.
* Latence P95 : < 500ms (v2 §11.3).
* Erreur rate : < 1% (5xx).
* Conformité v2 : 100% des sections §1-13 documentées comme
  livrées.

## FIN DU PROMPT

Tu es prêt à continuer. Bonne chance !

— Session précédente (Arena Agent, 30 juillet 2026)
