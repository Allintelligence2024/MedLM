# Phase 15.5 — Partage social (résultats mock exam)

> Statut : **terminée**. Les utilisateurs peuvent générer une
> carte de partage (image PNG + texte) à partir d'un résultat
> de mock exam. Conformité RGPD respectée : opt-in explicite,
> pseudonyme obligatoire, expiration 30 jours, pas de tracking.

## Livré

```
backend/src/
├── db/
│   ├── schema/share.ts                 (share_cards)
│   └── migrations/0008_share_cards.sql
├── share/
│   ├── share.dto.ts                    (CreateShareBody, ShareCard, PublicShareMetadata)
│   ├── share.service.ts                (createShare, getPublic, formatShareText)
│   ├── share.controller.ts             (POST /v1/share, GET /v1/share/:id)
│   └── share.module.ts

backend/test/unit/
└── share.test.ts                       (8 cas : 4 formatShareText + 4 Zod)
```

## Choix structurants

### Conformité RGPD by design

* **Pas d'email** dans la réponse publique.
* **Pas d'user_id** dans la réponse publique.
* **Pas d'IP** stockée.
* **Pas de tracking** (pas d'event "shared", pas d'UTM, pas de
  pixel).
* **Pseudonyme obligatoire** : on prend celui de
  `leaderboard_optin`, ou fallback "anonyme". L'utilisateur ne
  peut PAS partager avec son vrai nom dans la v1.
* **Expiration 30 jours** : la table `share_cards` a un
  `expires_at` indexé. Un cron (Phase 16) purgera les cartes
  expirées.

### Trois styles de carte

* `minimal` : juste le score et le module (WhatsApp-friendly).
* `detailed` : ajoute faculté, année, emoji décoratifs.
* `story` : format vertical 9:16 (Instagram Stories).

Le rendu PNG réel viendra en Phase 18 (puppeteer ou un service
dédié). Pour l'instant, on retourne une URL placeholder et un
texte formaté — l'API est en place, le rendu est trivial à
brancher.

### Endpoint `GET /v1/share/:id` public

Permet à n'importe qui (même non-auth) de prévisualiser une
carte via son URL. Renvoie uniquement les métadonnées
publiques, jamais l'`attempt_id` ni le `user_id`.

## Conformité v2 (Phase 15.5)

| Exigence v2 | État |
|---|---|
| §11.3 Partage social des résultats | ✅ |
| §13 RGPD : pas d'identité réelle | ✅ pseudonyme obligatoire |
| §13 RGPD : expiration limitée | ✅ 30 jours |
| §13 RGPD : pas de tracking | ✅ 0 event "shared" |
| §11.3 Formats multiples (Story, etc.) | ✅ minimal/detailed/story |

## Hors périmètre

* Rendu PNG réel (puppeteer, sharp) — Phase 18.
* Hook WhatsApp Business / Instagram Graph API — Phase 18.
* Tracking des partages (combien de fois, par qui) — exclu par
  RGPD.
* Génération de variantes multilingues (FR/EN/AR) — Phase 17.

## Vérification

```bash
cd backend
npm run test:unit -- share.test.ts
# 8 cas : 4 formatShareText + 4 Zod.
```
