# Phase 16.4 — B2B multi-tenants

> Statut : **terminée**. La plateforme supporte maintenant
> plusieurs institutions (facultés, hôpitaux, écoles) avec
> branding, rôles, et endpoints d'administration.

## Livré

```
backend/src/
├── db/
│   ├── schema/tenants.ts            (tenants + user_tenants)
│   └── migrations/0010_tenants.sql
├── tenants/
│   ├── tenants.dto.ts               (CreateTenantBody, AddUserBody, TenantView)
│   ├── tenants.service.ts           (create, listForUser, addUser, removeUser, getBrandingBySlug)
│   ├── tenants.controller.ts        (admin + PublicTenantController)
│   └── tenants.module.ts

backend/test/unit/
└── tenants.test.ts                  (10 cas : 7 CreateTenant + 3 AddUser)
```

## Choix structurants

### Multi-tenancy par lien user_tenants

Un user peut être lié à **plusieurs tenants** (cas réel :
prof qui enseigne dans 2 facultés). Table de jonction
`user_tenants` avec un rôle par tenant. Pas de hiérarchie
imposée — le rôle est local à la relation.

### Branding public sans auth

`PublicTenantController` (route `/v1/tenants/public/branding?slug=X`)
expose le branding (logo, primary_color) **sans authentification**.
C'est nécessaire pour que le mobile puisse adapter ses couleurs
avant que l'utilisateur se connecte.

### Endpoints admin via RBAC

`POST /v1/tenants` et `POST /v1/tenants/:id/users` sont gardés
par `@RequireRole('admin')` (admin plateforme). Pour la v1, on
considère qu'il n'y a qu'un seul niveau d'admin ; le scoping
"admin du tenant X" (vs "admin plateforme") viendra en Phase
18+.

### Scoping des decks : NON FAIT

Volontairement, on n'a **pas** ajouté `tenant_id` aux tables
`decks`, `cards`, etc. pour la v1. C'est une migration invasive
(ajout de colonne + backfill + recâblage de toutes les
requêtes). Phase 18+ : ajout de `tenant_id` nullable + migration
progressive.

## Conformité v2 (Phase 16.4)

| Exigence v2 | État |
|---|---|
| §3.2 B2B (multi-tenants) | ✅ |
| §3.2 Branding personnalisé | ✅ JSONB |
| §3.2 SSO institutionnel | ⏭️ Phase 18 (SAML/OIDC) |
| §3.2 Facturation centralisée | ⏭️ Phase 18 |
| §11.3 RBAC multi-niveaux | ✅ (admin / instructor / student) |

## Hors périmètre

* SSO SAML/OIDC (Phase 18).
* Scoping des decks par tenant (migration invasive, Phase 18).
* Dashboard admin (Phase 18 — UI).
* Métriques par tenant (Phase 18).

## Vérification

```bash
cd backend
npm run test:unit -- tenants.test.ts
# 10 cas : 7 CreateTenant (slug, country, plan, branding),
# 3 AddUser (rôle, user_id).
```
