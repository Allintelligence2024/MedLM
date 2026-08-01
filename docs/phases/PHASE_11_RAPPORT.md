# Phase 11 — CMS Next.js (squelette)

> Statut : **terminée (squelette)**. Le CMS tourne, consomme
> l'API backend, et expose la structure RBAC. L'édition WYSIWYG et
> le workflow visuel viendront en Phase 11 bis.

## Livré

```
cms/
├── package.json              Next.js 14 + React 18 + Tailwind
├── tsconfig.json             strict
├── next.config.mjs
├── tailwind.config.ts
├── README.md
├── .env.example
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx         (nav principale)
    │   ├── page.tsx           (landing / dashboard)
    │   └── admin/
    │       ├── cards/page.tsx  (liste + tableau)
    │       ├── exams/page.tsx  (placeholder)
    │       └── users/page.tsx  (placeholder)
    └── lib/
        └── api.ts            (apiFetch + CardSummary)
```

## Pages

| Route | Rôle requis | Description |
|---|---|---|
| `/` | (public) | Landing + navigation |
| `/admin/cards` | author+ | Liste des cartes, lecture seule |
| `/admin/exams` | editor+ | Sujets (placeholder) |
| `/admin/users` | admin | Utilisateurs (placeholder) |

## Choix structurants

### Consomme l'API backend existante

Le CMS n'a **pas** son propre backend : il parle au NestJS via
`apiFetch()`. Avantages :
- Une seule source de vérité (Drizzle, JWT, RBAC).
- Pas de migration de schéma à synchroniser entre deux backends.
- L'auth est déjà gérée (magic link, Google).

### Squelette UI, fonctionnel en lecture

Phase 11 livre ce qui est **utilisable** : voir la liste des cartes,
voir les rôles disponibles. Ce qui n'est pas encore implémenté est
explicitement marqué "Phase 11 bis" dans l'UI (bouton désactivé).

### RBAC propagé via le JWT backend

Le CMS récupère le JWT via `/v1/auth/login` (ou magic link), puis
utilise `@RequireRole('editor')` côté backend pour les actions
d'édition. Pas de RBAC dupliqué dans le CMS.

## Conformité v2 (Phase 11)

| Exigence v2 | État |
|---|---|
| §5.3 CMS workflow draft→review→published | Phase 11 bis (UI) |
| §5.3 Checklist qualité bloquante | ✅ côté API (ContentParser) |
| §5.3 RBAC 5 rôles | ✅ (côté backend, CMS s'aligne) |
| §5.3 Audit log complet | ✅ table `audit_log` (Phase 7) |
| §5.3 Gestion card_reports | Phase 11 bis |
| §5.3 Takedown flag par deck | ✅ `decks.can_distribute` (existant) |

## Hors périmètre (Phase 11 bis)

- Édition WYSIWYG bilingue des cartes
- Upload médias vers R2
- Workflow visuel drag & drop
- Création de sujets d'examen
- Export CSV de l'audit log
