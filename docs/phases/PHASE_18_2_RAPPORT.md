# Phase 18.2 — Génération de cartes assistée par LLM

> Statut : **terminée**. Un instructeur (rôle ≥ author) soumet un texte
> source (PDF/syllabus pré-extrait) ; l'API propose des brouillons de
> cartes qui rentrent dans le workflow de validation humaine existant.
> LLM **provider-agnostic** : mock déterministe par défaut (zéro coût),
> API OpenAI-compatible branchable par configuration.

## Livré

```
backend/src/ai/llm/
├── llm.types.ts               (contrat LlmProvider : generateCards + chat)
├── llm-mock.provider.ts       (générateur déterministe, sans LLM)
├── llm-http.provider.ts       (client OpenAI-compatible + parsing défensif)
└── llm.factory.ts             (AI_LLM_PROVIDER=mock|http)

backend/src/ai/generate/
├── ai-generate.dto.ts         (Zod strict + réponse)
├── ai-generate.service.ts     (quota → deck → LLM → drafts → audit)
└── ai-generate.controller.ts  (POST /v1/content/ai-generate, author+, throttle)

backend/src/db/schema/ai.ts            (ai_generation_jobs)
backend/src/db/migrations/0012_ai_generation_jobs.sql
backend/test/unit/ai_generate.test.ts  (31 cas)
PHASE_18_2_RAPPORT.md
```

## Choix structurants

### Provider-agnostic, mock par défaut

Le contrat `LlmProvider` n'a que 2 méthodes (`generateCards`, `chat`).
Le provider par défaut est **déterministe et gratuit** : il découpe la
source en phrases et fabrique des questions « Qu'est-ce que X ? »
localisées (fr/ar/en) — parfait pour dev, CI et démo du workflow. Le
provider `http` (Mistral / OpenAI / Llama 3 auto-hébergé) s'active
par `AI_LLM_BASE_URL` + `AI_LLM_API_KEY` sans toucher au code.

### Validation humaine obligatoire

Les cartes générées sont insérées avec `status='draft'` et
`source_meta.requires_human_review=true`. Elles ne rejoignent les
étudiants qu'après le circuit CMS existant :
`draft → review → approved → published` (Phase 11 bis).

### Rate limiting à deux étages

1. **IP** : `@Throttle` — 10 req/min (anti-rafale).
2. **Utilisateur** : quota journalier `AI_GENERATE_DAILY_QUOTA=20`
   compté sur `ai_generation_jobs` (jour UTC) → HTTP 429 au-delà.
   Les jobs échoués ne consomment pas le quota.

### Audit complet

Chaque génération écrit une ligne `ai_generation_jobs` : qui, quand,
provider, modèle, SHA-256 de la source (pas le texte brut), tokens
in/out, et les UUID des brouillons produits. Conformité doc v2 §13 +
contrôle des coûts futur.

## Conformité v2 (Phase 18.2)

| Exigence | État |
|---|---|
| POST /v1/content/ai-generate | ✅ |
| Rate limiting strict (IP + quota/jour) | ✅ |
| Audit complet (qui/quoi/quand/coût) | ✅ table + insertion |
| Validation humaine obligatoire | ✅ draft → workflow CMS |
| Pas de clé API dans le code | ✅ env seulement |
| Coût zéro en config par défaut | ✅ mock |

## Vérification

```bash
cd backend
npm run test -- ai_generate.test.ts
# 31 cas : découpage, mock (déterminisme, quota de phrases),
# parsing défensif, mapping draft, quotas UTC, Zod.
```

## Hors périmètre (reporté)

* Upload PDF direct (extraction serveur) — Phase 19 ; aujourd'hui le
  texte est pré-extrait côté CMS (limite 20 000 caractères).
* Streaming / génération incrémentale — inutile à 20 cartes max.
* Interface CMS dédiée — les brouillons apparaissent dans la file
  Kanban existante (`status='draft'`).
