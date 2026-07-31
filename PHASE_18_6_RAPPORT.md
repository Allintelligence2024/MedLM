# Phase 18.6 — Voice tutoring (chatbot pédagogique, conformité stricte)

> Statut : **terminée**. Assistant vocal pour questions médicales de
> cours, branché sur le `LlmProvider` provider-agnostic (mock par
> défaut, Mistral/Llama 3 auto-hébergé ou API externe par env), avec
> **disclaimer obligatoire** et audit append-only des prompts.

## Livré

```
backend/src/ai/tutor/
├── tutor.policy.ts            (disclaimer, urgences, périmètre, system prompt)
├── tutor.service.ts           (quota → policy → LLM → assemblage → audit)
├── tutor.controller.ts        (POST /v1/ai/tutor/ask)
└── tutor.dto.ts               (Zod — history ≤ 10, rôles user/assistant)

backend/src/db/schema/ai.ts               (+ ai_tutor_prompts)
backend/src/db/migrations/0015_ai_tutor_prompts.sql  (append-only + triggers)
backend/test/unit/ai_tutor.test.ts        (24 cas)
PHASE_18_6_RAPPORT.md
```

## Choix structurants — conformité §13

### Disclaimer non désactivable, *dans* le texte servi

`composeFinalAnswer` garantit l'invariant **testé** :
la réponse se termine TOUJOURS par le disclaimer localisé
(« Ceci n'est pas un avis médical… »). Il est dans le corps du texte,
donc présent aussi quand le mobile lit la réponse à voix haute (TTS) —
la conformité ne dépend ni du client, ni du modèle, ni du prompt.

### Détection d'urgence → numéros algériens

Mots-clés fr/ar/en (douleur thoracique, ألم في الصدر, chest pain,
suicide, overdose…). Si détection : l'avis d'urgence (SAMU **115**,
Protection civile **14**) est **prépendé**, le disclaimer resté en
clôture. Le LLM répond quand même (pédagogie), mais jamais en premier.

### Périmètre : fail-closed sur le hors-sujet évident

Liste `OFFTOPIC_KEYWORDS` (football, crypto, recette…) → réponse de
redirection localisée **sans appel LLM** (coût zéro, provider
`policy-guard` en audit). Ailleurs : fail-open assumé — mieux vaut
répondre avec disclaimer qu'interdire une vraie question de cours.

### Audit append-only (même pattern que review_logs)

`ai_tutor_prompts` : question, réponse **servie**, hashes SHA-256,
provider/modèle, tokens, flags `emergency`/`within_scope`. Triggers
PostgreSQL `no_update` / `no_delete` (migration 0015, idempotente) —
un audit ne se réécrit pas. Double écriture dans
`ai_generation_jobs` (`kind='tutor_ask'`) pour les quotas 30/jour.

### Anti-injection

`history` n'accepte que les rôles `user`/`assistant` (Zod `.strict()`
+ enum) : impossible d'injecter un faux system prompt via la mémoire
courte. System prompt serveur, cadre pédagogique strict (pas de
diagnostic, pas de traitement, reformulation obligée).

## Conformité v2 (Phase 18.6)

| Exigence | État |
|---|---|
| Disclaimer « pas un avis médical » obligatoire | ✅ invariant testé, dans le texte |
| LLM open-source OU API externe | ✅ provider-agnostic (mock/http) |
| Audit des prompts | ✅ append-only + triggers |
| Rate limiting | ✅ 10/min IP + 30/jour |
| Urgences redirigées | ✅ SAMU 115 / Protection civile 14 |

## Vérification

```bash
cd backend
npm run test -- ai_tutor.test.ts
# 24 cas : disclaimers 3 langues, urgences, périmètre, invariants
# d'assemblage, messages LLM, anti-injection, Zod.
```

## Hors périmètre (reporté)

* STT/TTS côté mobile (speech_to_text / flutter_tts) branchés sur cet
  endpoint — chantier mobile dédié.
* Mode streaming (SSE) pour les réponses longues — le mock et la
  limite « 5 phrases max » le rendent inutile aujourd'hui.
* Évaluation qualité des réponses (dataset de régression ML) —
  Phase 20, dès qu'un vrai modèle est branché.
