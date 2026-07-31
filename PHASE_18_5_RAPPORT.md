# Phase 18.5 — Détection de décrochage (alertes rétention)

> Statut : **terminée**. Détection proactive des étudiants inactifs et
> alertes push via l'infrastructure Phase 14 (FCM/Android, APNs/iOS),
> avec anti-spam strict et fenêtre 8h-22h déjà garantie par
> `NotificationsService`.

## Livré

```
backend/src/ai/retention/
├── retention.messages.ts      (3 niveaux × 3 langues, ton bienveillant)
├── retention.service.ts       (classification + anti-spam + orchestration)
└── retention.controller.ts    (GET preview / POST scan, rôle admin)

backend/src/db/schema/ai.ts              (+ retention_alerts)
backend/src/db/migrations/0014_retention_alerts.sql
backend/src/notifications/push.types.ts  (+ kind 'retention_alert')
backend/test/unit/ai_retention.test.ts   (17 cas)
PHASE_18_5_RAPPORT.md
```

## Choix structurants

### 3 niveaux d'inactivité (sur `users.last_seen_at`)

| Jours | Niveau | Message (FR) |
|---|---|---|
| 3-4 | `gentle` | « 5 cartes suffisent pour relancer la mémoire » |
| 5-9 | `streak_broken` | « N jours sans révision… 3 cartes maintenant » (+ streak perdu si connu) |
| ≥ 10 | `reengagement` | « Reprenez en douceur : une session de 5 cartes » |

Ton **bienveillant et actionnable**, jamais culpabilisant — le
message culpabilisant est le premier facteur de désinstallation.

### Anti-spam : déduplication sur `retention_alerts`

Une ligne n'est consignée que si au moins une notification est
**réellement partie** (échec provider → retente au prochain scan).
Règles :

* même niveau → **7 jours** de cooldown ;
* escalade (gentle → streak_broken → reengagement) → possible après **3 jours** ;
* désescalade pendant le cooldown → ignorée.

### Fenêtre 8h-22h (Phase 14), double verrou

`runScan` vérifie `isWithinNotificationWindow` **globalement** :
hors fenêtre, l'exécution entière est différée (`deferred: true`),
rien n'est envoyé ni comptabilisé — le prochain scan reprendra.
Le CronJob K8s cible 09:30 / 18:30.

### Deeplink utile

Chaque alerte pointe vers `medanki://study/quick` (QuickSession
Phase 15.1) : l'effort demandé est visible *avant* l'ouverture de
l'app — 5 cartes, 2 minutes.

### Endpoints

| Méthode | Route | Rôle | Effet |
|---|---|---|---|
| GET | `/v1/ai/retention/preview` | admin | simulation (aucun envoi) |
| POST | `/v1/ai/retention/scan` | admin | balayage + envoi réel |

## Conformité v2 (Phase 18.5)

| Exigence | État |
|---|---|
| Alerte « vous n'avez pas révisé depuis 5 jours, streak cassé » | ✅ niveau streak_broken |
| Système de notifications Phase 14 (FCM/APNs) | ✅ NotificationsService |
| Fenêtre 8h-22h | ✅ double verrou (global + provider) |
| Anti-spam | ✅ cooldowns 7 j / escalade 3 j |
| Langue utilisateur | ✅ fr/ar/en via `lang_pref` |

## Vérification

```bash
cd backend
npm run test -- ai_retention.test.ts
# 17 cas : bornes exactes, matrice anti-spam, messages trilingues.
```

## Hors périmètre (reporté)

* CronJob K8s (`deploy/k8s/overlays/prod`) appelant `/scan` — ajout
  d'un manifest `retention-cronjob.yaml` au prochain lot infra.
* Exclusion des utilisateurs ayant désactivé les notifications dans
  l'OS — FCM/APNs retournent simplement `sent=false`.
* Score ML de churn (prédiction) — Phase 20.
