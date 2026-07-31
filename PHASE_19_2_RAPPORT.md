# Phase 19.2 — CronJob K8s de rétention (détection de décrochage)

> Statut : **terminée**. Le balayage de décrochage Phase 18.5 est
> désormais automatisé en production : 2 scans/jour dans la fenêtre
> de notification, avec la même rigueur manifeste que le backup CronJob.

## Livré

```
deploy/k8s/overlays/prod/
├── retention-cronjob.yaml          (ServiceAccount + CronJob)
├── kustomization.yaml              (+ resource + feature flag)
└── secrets/prod-secrets.yaml       (template : clé retention-cron-token)

PHASE_19_2_RAPPORT.md
```

## Choix structurants

### Horaires : 09:30 et 18:30 Africa/Algiers

Plein centre de la fenêtre légale de notification **08:00-22:00**
(Phase 14/18.5). Le backend revérifie de toute façon la fenêtre
(`deferred` si hors bornes) — la planification ET le service forment
un double verrou, comme le recommande le pattern déjà en place.

### Authentification : JWT de service longue durée

`POST /v1/ai/retention/scan` exige le rôle **admin**. Le pod porte
le token dans `backend-secrets/retention-cron-token` (template
`prod-secrets.yaml` documenté), signé par la même clé RS256 que les
JWT utilisateurs. JAMAIS de token dans le manifest Versionné :
seule la référence de clé. Rotation annuelle → `SECURITY.md`.

### Robustesse bac à sable → prod

* `curlimages/curl:8.10.1` (image minimale, digest stable).
* `--max-time 120` + `activeDeadlineSeconds 600` : un scan long ne
  peut pas bloquer la file (le service pagine à 500 users/lot).
* `concurrencyPolicy: Forbid` + `backoffLimit 2` : pas de doublon,
  les échecs remontent dans les événements K8s → Alertmanager
  (monitoring déjà branché Phase 17.1).
* Codes acceptés : 200/201/204/**429** — un quota ou une fenêtre
  différée est un succès contrôlé, pas un échec de job.

### Idempotence duale

Le service garantit (Phase 18.5) qu'un second scan dans la même
journée ne renvoie pas les mêmes notifications (cooldowns 7j/3j) ;
le CronJob peut donc être relancé manuellement sans risque.

## Sécurité

| Contrôle | Détail |
|---|---|
| Least privilege | SA vide (zéro règle RBAC), HTTP sortant seul |
| Secret hors git | `backend-secrets/retention-cron-token` via ESO/Vault |
| Resources strictes | 50-200m CPU, 32-64Mi RAM |
| Audit | les runs réussis laissent `retention_alerts` + logs K8s |

## Vérification

```bash
python3 - <<'EOF'
import yaml
docs = list(yaml.safe_load_all(open('deploy/k8s/overlays/prod/retention-cronjob.yaml')))
assert docs[0]['kind'] == 'ServiceAccount'
assert docs[1]['kind'] == 'CronJob'
assert docs[1]['spec']['schedule'] == '30 9,18 * * *'
assert docs[1]['spec']['timeZone'] == 'Africa/Algiers'
assert docs[1]['spec']['concurrencyPolicy'] == 'Forbid'
print('OK')
EOF
# kubectl diff (hors sandbox) : kustomize build deploy/k8s/overlays/prod
```

## Hors périmètre (reporté)

* Le rôle dédié `retention_worker` (au lieu d'admin) si on veut
  scinder : aujourd'hui scan = admin-only, acceptable en prod
  contrôlée mais à revoir au bug bounty program (19.4).
* Metric Prometheus `retention_alerts_sent_total` — l'endpoint
  scan loggue déjà ; un `/metrics` aggregation viendra avec
  l'observabilité Phase 20.
