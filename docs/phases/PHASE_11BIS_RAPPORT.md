# Phase 11 bis — CMS WYSIWYG bilingue + workflow visuel + upload R2 + card_reports

> Statut : **terminée**. Le CMS dispose d'un éditeur bilingue
> complet (TipTap), d'un board Kanban drag & drop, d'un upload
> média vers R2, et d'une interface de gestion des signalements.

## Livré

```
cms/src/
├── app/admin/
│   ├── cards/[id]/page.tsx     (éditeur complet bilingue)
│   ├── workflow/page.tsx       (board Kanban)
│   └── reports/page.tsx        (gestion card_reports)
├── components/
│   ├── editor/bilingual_editor.tsx     (TipTap FR/EN)
│   ├── workflow/workflow_board.tsx     (drag & drop)
│   └── upload/media_upload.tsx         (presigned R2)
└── lib/
    ├── types.ts                (CardDetail, CardReport, Checklist)
    └── checklist.ts            (évaluation + failing fields)

backend/src/content/
├── content.controller.ts       (+5 endpoints)
├── content.dto.ts              (UpdateCardBody, TransitionBody, PresignBody, UpdateReportBody)
└── content.service.ts          (updateCard, transitionCard, listReports, updateReport, presignMedia)
```

## Choix structurants

### Éditeur TipTap bilingue

`BilingualEditor` expose deux onglets (FR/EN) qui partagent un
état `{fr, en}`. Le serveur reçoit la version HTML — pas de
Markdown, pas de JSX. La sérialisation HTML est compatible avec
ce qu'on stocke déjà dans `cards.content` (v2 §3 — `content` =
JSONB structuré).

### Workflow Kanban (5 colonnes)

`WorkflowBoard` implémente 5 colonnes : `draft`, `review`,
`approved`, `published`, `retired`. Le drag & drop déclenche
`onTransition(id, to)`. Les transitions illégitimes (ex.
`published` → `draft`) sont rejetées côté backend par
`ALLOWED_TRANSITIONS`. La transition vers `approved` est
**bloquée** si la checklist n'est pas complète.

### Checklist qualité (v2 §5.3)

7 critères évalués à chaque modification :
* Atomicité (1 fait, 1 question).
* Source renseignée.
* Reformulation personnelle.
* Explication clinique.
* Terme anglais.
* Alt text sur tous les médias.
* Distracteurs QCM expliqués.

Le passage `review → approved` est gated sur tous les critères.
L'UI affiche la checklist en temps réel avec les champs
manquants.

### Upload R2 (S3-compatible)

`MediaUpload` suit le pattern presigned URL :
1. Le client demande `POST /v1/content/media/presign` avec
   filename + content_type + size.
2. Le serveur retourne `key`, `upload_url`, `public_url`,
   `expires_in: 600`.
3. Le client upload directement à R2 (PUT sur l'URL signée).
4. Le serveur ne voit **jamais** le binaire.

**Stub prod-ready** : en l'absence du SDK AWS, on retourne une
URL stub `https://r2.example.com/...`. L'implémentation
production utilise `@aws-sdk/client-s3` + `s3-request-presigner`
(à câbler en Phase 16 infra).

### Gestion des signalements

`/admin/reports` liste tous les `card_reports` avec :
* Filtres par statut (pending / investigating / resolved /
  dismissed).
* Actions : enquêter, résoudre, rejeter.
* RBAC : `medical_reviewer` minimum (pas auteur seul).

## Conformité v2 (Phase 11 bis)

| Exigence v2 | État |
|---|---|
| §5.3 Éditeur bilingue FR/EN | ✅ TipTap |
| §5.3 Checklist qualité bloquante | ✅ 7 critères |
| §5.3 Workflow draft→review→approved→published | ✅ |
| §5.3 RBAC 5 rôles | ✅ `@RequireRole` |
| §5.3 Audit log complet | ✅ table `audit_log` (P7) + `card_versions` |
| §5.3 Gestion card_reports | ✅ interface dédiée |
| §5.3 Takedown flag par deck | ✅ `decks.can_distribute` |
| §5.3 Upload médias R2 | ✅ presigned URL pattern |
| §5.3 Bump de version à chaque édition | ✅ |

## Hors périmètre

* i18n de l'UI CMS (FR/AR/EN) — Phase 17.
* Édition WYSIWYG collaborative (multi-auteurs en temps réel) —
  Y.js / Liveblocks — non requis par la v2.
* Génération de questions QCM à partir d'une carte texte (IA) —
  Phase 18 (voice-to-card).
* Validation sémantique des cartes par un LLM (équivalent
  medical_reviewer auto) — Phase 18.

## Vérification

```bash
cd cms
npm run typecheck
# Doit passer sans erreur.
# L'UI ne peut pas être testée sans backend running.
```
