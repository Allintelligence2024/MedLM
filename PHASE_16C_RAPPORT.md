# Phase 16.3 — Pack groupe (5 étudiants, -30%)

> Statut : **terminée**. Un coordinateur peut créer un pack
> groupe, inviter 4 étudiants via un code à 6 caractères, et
> tous paient ensemble avec une réduction de 30%. Conformité
> v2 §8.2.

## Livré

```
backend/src/
├── db/
│   ├── schema/group-packs.ts           (group_packs + group_pack_members)
│   └── migrations/0009_group_packs.sql
├── group-packs/
│   ├── group-packs.dto.ts              (CreatePackBody, JoinPackBody, GroupPackView)
│   ├── group-packs.service.ts          (create, join, get, _computeSavings)
│   ├── group-packs.controller.ts       (POST, GET, POST /join)
│   └── group-packs.module.ts

backend/test/unit/
└── group_packs.test.ts                 (10 cas : 3 pricing, 2 codes, 5 Zod)
```

## Choix structurants

### Code d'invitation robuste

* 6 caractères.
* Alphabet **32 caractères** (sans 0/O/1/I/L — visuellement
  ambigus).
* Probabilité de collision sur 32^6 ≈ 1 milliard.
* Indexé unique en DB (`group_packs_invite_code_idx`).

### Pricing -30%

`GroupPacksService._computeSavings(plan)` :
* `perUserCents = round(baseCents × 0.7)`.
* `savingsCents = (baseCents - perUserCents) × 5`.

Pour le plan yearly (2400 DA) :
* Normal : 2400 DA.
* Par user : 1680 DA.
* Économie totale : 3600 DA pour 5.

### TTL 24h

`expiresAt = now + 24h`. Un pack qui n'atteint pas 5 membres en
24h passe en `status: 'expired'`. Un cron (Phase 16+ worker)
purgera les packs expirés et notifiera le coordinateur.

### États du pack

* `pending` : 1-4 membres.
* `full` : 5 membres (prêt à payer).
* `paid` : paiement Chargily confirmé.
* `cancelled` : coordinateur a annulé.
* `expired` : TTL dépassé.

### Idempotence d'adhésion

`(pack_id, user_id)` est unique. Si un user essaie de rejoindre
deux fois, on catch l'erreur UNIQUE et on renvoie
`BadRequestException('déjà membre de ce pack')`. Pas de
double-count.

## Conformité v2 (Phase 16.3)

| Exigence v2 | État |
|---|---|
| §8.2 Pack groupe 5 étudiants -30% | ✅ |
| §8.2 Coordinateur + 4 invités | ✅ |
| §8.2 Paiement groupé (Chargily) | ⏭️ Phase 16+ (payment_url à câbler) |
| §13 Opt-in explicite | ✅ via invite_code (le user doit connaître et saisir) |
| §11.3 Idempotence webhook | ✅ via `paymentRef` |

## Hors périmètre

* Paiement Chargily réel (Phase 16+ worker).
* Cron de purge des packs expirés (Phase 16+).
* Notifications push "Votre pack est plein" (Phase 14+).
* Partage social d'un pack réussi (Phase 15.5 — share).

## Vérification

```bash
cd backend
npm run test:unit -- group_packs.test.ts
# 10 cas : 3 pricing, 2 codes (longueur + unicité),
# 5 Zod (plan valide/invalide/faculty, code court/spéciaux).
```
