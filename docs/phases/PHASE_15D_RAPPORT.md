# Phase 15.4 — Mode hors-ligne étendu (OfflineCacheManager)

> Statut : **terminée**. Les decks premium téléchargés sont
> maintenant stockés chiffrés sur disque, et un LRU évinceur
> garantit que le cache reste sous une borne configurable. Un
> utilitaire `ConnectivityAware` distingue online / offline /
> unknown.

## Livré

```
mobile/lib/core/offline/
├── offline_cache.dart           (OfflineCacheManager, CachedDeck)
└── connectivity_aware.dart      (NetworkState, ConnectivityAware)

mobile/test/offline/
└── offline_cache_test.dart      (9 cas : canServe, save/load, mauvais
                                  clé, evict, list, totalSize, LRU)
```

## Choix structurants

### Chiffrement AES-256-GCM au repos

Chaque bundle est chiffré avec la `deckKey` (déjà wrappée côté
serveur en Phase 14). Le fichier sur disque est illisible sans
la clé, qui est elle-même dans le Keystore/Keychain. **Attaque
physique du device = KO** (sans le déverrouillage biométrique,
la clé n'est pas accessible).

### LRU évinceur

`evictLru(maxBytes)` trie les bundles par `lastAccessedAt` et
purge les plus anciens tant qu'on dépasse le seuil. C'est
suffisant pour la plupart des cas (l'utilisateur ré-accède
souvent aux mêmes decks). On n'implémente pas LFU/ARC pour
l'instant — Phase 18 si besoin.

### Le cache contient le JSON déchiffré — pas l'EncryptedDeck

Le bundle dans le cache est le JSON `cards` après déchiffrement.
Pourquoi ? Parce que la `deckKey` peut être révoquée par le
serveur (Phase 14). Si on gardait le `EncryptedDeck` chiffré,
il faudrait le re-wrap à chaque revalidation. Ici on garde le
JSON clair (re-chiffré par AES-GCM) — le coût en espace est
négligeable, le gain en simplicité est grand.

### `ConnectivityAware` séparé

Pas de dépendance directe entre `OfflineCacheManager` et la
détection réseau : c'est un composant réutilisable. Le test
d'acceptation v2 §14 ("ouvrir en mode avion") utilise
`ConnectivityAware.current() == NetworkState.offline` comme
pré-condition, pas `OfflineCacheManager`.

## Conformité v2 (Phase 15.4)

| Exigence v2 | État |
|---|---|
| §3 Offline-first | ✅ cache + LRU |
| §8.1 Chiffrement au repos | ✅ AES-256-GCM par deckKey |
| §14 Test d'acceptation mode avion | ✅ condition vérifiable |
| §3 Pas d'appel réseau bloquant | ✅ lecture cache local d'abord |

## Hors périmètre

* Compression des bundles (gzip / brotli) — Phase 18 si la
  taille devient un problème.
* Pré-chargement intelligent (télécharger les decks "à
  réviser demain" en tâche de fond) — Phase 14+ (WorkManager
  étendu).
* Migration depuis un cache existant — Phase 16 (à l'ouverture
  prod).

## Vérification

```bash
cd mobile
flutter pub get
dart test test/offline/offline_cache_test.dart
# 9 tests verts.
```
