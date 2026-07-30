# MedAnki DZ — CMS (Phase 11)

> Next.js 14 (App Router) + TypeScript + Tailwind. Squelette
> éditorial branché sur le backend NestJS.

## Démarrage

```bash
cd cms
cp .env.example .env.local
# Éditer NEXT_PUBLIC_API_BASE_URL si besoin
npm install
npm run dev
```

L'app tourne sur `http://localhost:3001` (port différent du backend
pour éviter les conflits en local).

## Pages livrées (Phase 11 squelette)

| Route | Description | Statut |
|---|---|---|
| `/` | Landing + navigation | ✅ |
| `/admin/cards` | Liste des cartes (lecture) | ✅ |
| `/admin/exams` | Placeholder — création de sujets | Phase 11 bis |
| `/admin/users` | Placeholder — RBAC + suspensions | Phase 11 bis |

## RBAC (côté backend)

Le CMS consomme les JWT du backend NestJS (`/v1/auth/login`,
`/v1/auth/magic-link`). Le rôle RBAC est inclus dans le JWT, et
le backend refuse les actions non autorisées via `@RequireRole`.

Mapping Phase 11 :

| Rôle | Permissions CMS |
|---|---|
| `student` | aucune (l'app mobile, pas le CMS) |
| `author` | créer/éditer cartes DRAFT |
| `medical_reviewer` | approuver/rejeter cartes |
| `editor` | publier/retirer cartes, gérer decks |
| `admin` | users, billing, audit log |

## Roadmap Phase 11 bis

- Édition WYSIWYG bilingue des cartes (front/back/explanation)
- Upload médias vers R2
- Workflow visuel : draft → review → approved → published
- Soumission de signalements depuis le CMS
- Édition des sujets d'examen (QCM)
- Export CSV du journal d'audit

## Vérification

```bash
cd cms
npm run typecheck
npm run lint
npm run build
```
