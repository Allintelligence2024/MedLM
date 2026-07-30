# Phase 18.3 — Voice-to-card (dictée vocale → brouillon)

> Statut : **terminée**. L'étudiant dicte une question à voix haute ;
> l'API la transcrit (STT client de préférence, ou Transcriber HTTP
> Whisper-compatible), la formate en carte par règles pures et
> l'enregistre en **brouillon** pour révision par l'auteur. Prise de
> notes rapide en amphi, zéro LLM, zéro coût en config par défaut.

## Livré

```
backend/src/ai/voice/
├── transcriber.types.ts           (contrat TranscriberProvider)
├── transcriber-mock.provider.ts   (déterministe, marqué [MOCK])
├── transcriber-http.provider.ts   (Whisper-compatible, multipart)
├── transcriber.factory.ts         (AI_TRANSCRIBER_PROVIDER=mock|http)
├── card-formatter.ts              (3 règles fr/ar/en, pures)
├── voice-to-card.dto.ts           (Zod + refine ≥1 source audio)
├── voice-to-card.service.ts       (quota → deck → transcribe → format → draft → audit)
└── voice-to-card.controller.ts    (POST /v1/ai/voice-to-card)

backend/test/unit/voice_to_card.test.ts  (19 cas)
PHASE_18_3_RAPPORT.md
```

## Choix structurants

### STT côté client = chemin préféré

Le mobile peut transcrire localement et n'envoyer que
`audio_transcript`. Avantages : pas d'upload audio (vie privée,
bande passante 3G/4G algérienne), offline-friendly, coût nul. Le
transcriber serveur (Whisper auto-hébergé ou API) reste disponible
via `audio_base64` pour les clients sans STT embarqué.

### 3 règles de formatage, déterministes

| # | Règle | Exemple |
|---|---|---|
| 1 | `question_split` — dictée « … ? … » | `Quel nerf… ? Le nerf radial.` → front avant le `?`, back après |
| 2 | `definition` — « X est/c'est/is Y » | → `Qu'est-ce que X ?` localisé |
| 3 | `fallback` — note brute | → `À propos de : « … »` |

Placeholders localisés (fr/ar/en) quand la réponse manque : la carte
part de toute façon en **révision auteur**.

### RBAC assumé : JwtGuard seul

L'endpoint est ouvert aux étudiants (c'est *leur* cahier de
brouillons). Sécurité éditoriale garantie ailleurs : `status='draft'`
+ `requires_human_review=true` + workflow CMS — un brouillon vocal
ne peut jamais être publié par son auteur.

### Quota + audit

Quota journalier `AI_VOICE_DAILY_QUOTA=50` (jour UTC) ;
audit dans `ai_generation_jobs` (`kind='voice_to_card'`, hash SHA-256
de la transcription — jamais l'audio, jamais le texte brut).

## Conformité v2 (Phase 18.3)

| Exigence | État |
|---|---|
| Dictée → transcription (local ou API) | ✅ deux chemins |
| Formatage en carte + draft | ✅ 3 règles testées |
| Révision par l'auteur obligatoire | ✅ workflow CMS |
| Rate limiting | ✅ throttle 20/min + quota/jour |
| Audit (qui/quoi/quand) | ✅ ai_generation_jobs |

## Vérification

```bash
cd backend
npm run test -- voice_to_card.test.ts
# 19 cas : 3 règles de formatage × langues, mock STT, mapping draft, Zod.
```

## Hors périmètre (reporté)

* Reconnaissance vocale Flutter (speech_to_text) — côté mobile quand
  l'UI de prise de notes sera branchée sur cet endpoint.
* Segmentation multi-questions dans une longue dictée (N cartes par
  soumission) — Phase 19 si l'usage le demande.
* Support darija (arabe algérien) — nécessite un modèle STT spécifique ;
  aujourd'hui `lang=ar` couvre l'arabe standard.
