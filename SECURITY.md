# Politique de sécurité — MedAnki DZ

> Dernière révision : 31 juillet 2026 (Phase 19.4).
> Contact sécurité : **security@medanki-dz.com** (alias équipe core).
> Langue de rapport acceptée : français, arabe ou anglais.

MedAnki DZ manipule des données d'étudiants en médecine algériens
(profil, progression, contenus médicaux) et des paiements en dinars
(Chargily). La sécurité est une condition de lancement — ce document
définit la divulgation responsable, le périmètre et le programme de
primes (bug bounty léger, adapté à la taille de l'équipe).

---

## 1. Canal de signalement

* **Email privé :** `security@medanki-dz.com` — chiffrement PGP
  souhaité (empreinte publiée à la rotation des clés).
* **Ne PAS** ouvrir d'issue GitHub publique pour une faille
  confirmée ou suspectée.
* Joindre : description, impact potentiel, étapes de reproduction
  (PoC), environnement (version app, OS), logs épurés de tout
  secret ou donnée d'un tiers.

## 2. Nos engagements (SLA)

| Étape | Délai objectif |
|---|---|
| Accusé de réception | 48 h ouvrées |
| Triage & qualification (CVSS provisoire) | 7 jours |
| Correctif critique (CVSS ≥ 9) | 14 jours |
| Correctif haute (7-8.9) | 30 jours |
| Correctif moyenne (4-6.9) | 60 jours |
| Divulgation coordonnée | ≤ 90 jours après triage (ou à notre demande motivée) |
| Publication post-mortem (critiques/hautes) | 30 jours après le correctif |

Si le délai risque d'être dépassé, on vous prévient **avant** —
la re-publication immédiate d'une faille corrigée est du ressort
du chercheur, pas d'une menace.

## 3. Safe harbor (protection du chercheur)

Nous **ne poursuivrons pas** un chercheur qui :

* agit de bonne foi et dans le respect du présent document ;
* limite ses tests à ses propres comptes et données ;
* n'accède pas, ne modifie pas, ne supprime pas les données
  d'autres utilisateurs (arrêt immédiat à la première donnée
  tierce rencontrée — la preuve de concept s'arrête là) ;
* ne divulgue pas publiquement avant la fenêtre coordonnée ;
* respecte la loi algérienne (notamment la loi 09-04 sur la
  prévention et la lutte contre les infractions liées aux TIC)
  et la loi 18-07 sur la protection des données personnelles.

## 4. Périmètre (in scope)

| Actif | Notes |
|---|---|
| API `api.medanki-dz.com` (NestJS, `/v1/*`) | priorité : auth, billing (Chargily), RBAC, endpoints IA Phase 18 |
| App mobile Android/iOS (Flutter) | stockage local chiffré (AES-256-GCM), vérification JWT offline, anti-triche |
| CMS `cms.medanki-dz.com` (Next.js) | RBAC, upload R2, workflow éditorial |
| Code & secrets du repo | fuites de clés, .env commités |
| Manifestes d'infrastructure (`deploy/`) | fuite dans logs, mauvaises perms |

### Hors périmètre (out of scope)

* Ingénierie sociale, phishing contre l'équipe ou les utilisateurs.
* Attaques physiques ou sur les locaux.
* Déni de service (volumétrique ou applicatif) — les rate limits
  sont documentés, ne les saturablez pas.
* Vulnérabilités des dépendances sans PoC d'exploitabilité réelle
  chez nous (les scans auto bruts = bruit).
* Versions obsolètes sans scénario d'attaque associé.
* Rapports générés par scanners automatiques sans analyse humaine.

## 5. Gravité & récompenses indicatives

La prime est à notre discrétion ; les montants ci-dessous sont des
planchers indicatifs en DZD pour un rapport complet, reproductible
et inédit. En l'absence de prime monétaire à ce stade de
pré-lancement, la **reconnaissance publique** (Hall of Fame +
référence professionnelle) est systématique à votre accord.

| Sévérité (CVSSv4) | Exemples | Prime indicative |
|---|---|---|
| Critique (≥ 9) | RCE serveur, bypass auth universel, exfiltration de la base, fraude paiement sans limite | 100 000 DZD + HOF |
| Haute (7-8.9) | IDOR massif, bypass RBAC sur endpoints admin/IA, lecture des données d'un autre étudiant | 50 000 DZD + HOF |
| Moyenne (4-6.9) | XSS stocké dans le CMS, fuite d'info sensible limitée, contournement de quota IA | 20 000 DZD + HOF |
| Basse (0.1-3.9) | En-têtes manquants, verbose error, hardening | HOF |

**Bonus explicite pour :** rapport avec correctif proposé, test de
régression inclus, analyse de cause racine.

## 6. Points durs déjà en place (ce qu'on a blindé avant vous)

| Domaine | Mesure | Réf. |
|---|---|---|
| Journal SRS | Append-only PostgreSQL (triggers no_update/no_delete) | migration 0002 |
| Audit tuteur IA | Append-only + SHA-256 des prompts/réponses | migration 0015 |
| Secrets | Jamais dans le code (audit CI), Vault/ESO en prod | `tools/scripts/security_audit.py` |
| Auth | JWT RS256 court (15 min) + rotation refresh | Phase 6 |
| Billing | Webhooks signés, idempotence | Phase 7 |
| Contenu | Validation Content Policy en CI | `tools/validate_content.py` |
| API | Zod strict partout, guards JWT+RBAC, throttles | audit CI |
| Tuteur IA | Disclaimer invariant, proscription diagnostic | Phase 18.6 |
| Mobile | Keystore Android / Keychain iOS, AES-256-GCM | Phase 8bis |

## 7. Rotation des secrets (référence 19.2)

| Secret | Rotation | Stockage |
|---|---|---|
| `jwt-signing-key` (RS256) | Annuelle | Vault, montée FS |
| `chargily-api-key` / secret | À chaud si incident | ESO |
| `retention-cron-token` (Phase 19.2) | Annuelle | `backend-secrets` K8s |
| `apns-private-key` | Annuelle | ESO |
| Clés de deck RSA-OAEP | Si compromise | scripts `backend/scripts/` |

## 8. Hall of Fame

_(Vide pour l'instant — le programme ouvre officiellement avec la
version publique. Merci d'avance aux premiers chercheurs.)_

## 9. Références internes

* `docs/phases/AUDIT_ARCHITECTURE.md` — audit initial de l'architecture.
* `PLAN_IMPLEMENTATION.md` — phases et mesures de sécurité.
* `backend/test/unit/*` — tests dont parité FSRS, RBAC, policy tuteur.
* `tools/scripts/security_audit.py` — garde-fou CI (0 secret, Zod,
  guards) — exécuté avant chaque merge.
