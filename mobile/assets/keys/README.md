# Clé publique d'entitlement

Ce dossier contient la clé publique RS256 utilisée par le client
mobile pour vérifier hors-ligne la signature du JWT d'entitlement
émis par le backend (cf. v2 §8.1 — « vérifiable offline via clé
publique »).

## Génération (runbook)

```bash
# Sur la machine backend (une seule fois, à la mise en place) :
cd backend
node scripts/generate_entitlement_keys.mjs
```

Cela produit :

* `keys/entitlement_private.pem` — **NE DOIT PAS être commitée**.
  À déployer sur le backend (secret Vault / K8s secret).
* `keys/entitlement_public.pem` — **À copier** dans ce dossier et
  à commiter.

## Rotation

Pour invalider tous les JWT en circulation :

1. Générer une nouvelle paire (script ci-dessus).
2. Déployer la nouvelle clé privée.
3. Remplacer la clé publique ici + bump `KID` (key id).
4. Au prochain refresh, les clients récupèrent un JWT signé avec
   la nouvelle clé, vérifiable avec la nouvelle clé publique
   bundlée.

## Fichier présent

Ce dossier contient pour l'instant une **clé de développement
auto-signée** (`entitlement_public.pem`). Elle est marquée
explicitement « DEV ONLY » dans son contenu et n'est **pas**
sécuritaire pour la production. À remplacer avant tout build de
prod par la clé générée par le runbook ci-dessus.
