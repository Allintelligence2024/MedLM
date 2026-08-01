# Checklist de soumission stores — Phase 19.8 (runbook opérationnel)

> Ce fichier est la procédure de lancement iOS/Android. Il se coche
> manuellement : aucune étape ne peut être automatisée dans le sandbox
> (consoles Apple/Google, signature, device physique requis).

## A. Prérequis comptes

- [ ] Google Play Console (25 $ une fois) + Apple Developer Program (99 $/an)
- [ ] Compte droit DZ enregistré (distributeur Chargily cohérent pour IAP/paiement local)
- [ ] Domaine vérifié pour la politique de confidentialité (pointer vers `store/PRIVACY.md` publié)

## B. Signature

- [ ] Android : keystore de release généré hors-VM, sauvegardé chiffré (2 copies hors site), Play App Signing activé
- [ ] iOS : certificat distribution + profil provisionnement App Store
- [ ] AndroidManifest/Info.plist : permissions limitées à MICROPHONE (dictée), NOTIFICATIONS (rétention), INTERNET — **pas** de localisation, pas de contacts

## C. Fiches store (contenu = `store/play/`, `store/apple/`)

- [ ] Titre/courte description conformes (≤ 80 caractères — vérifié par `tools/scripts/check_store.py`)
- [ ] Captures 6.5" + 5.5" (iOS) / phone + 7"+10" (Android) : tableau de bord, session d'étude avec HintBanner, tuteur (bulle avec disclaimer visible), examens blancs, écran offline
- [ ] Bannière feature graphic 1024×500 (Play) — pas de promesse médicale (« aide à la révision », jamais « diagnostic »)
- [ ] Catégorie : Éducation / Médecine ; classification contenu : 12+ (référence médicale)
- [ ] Chaque écran capturé montre le disclaimer du tuteur (exigence conformité 18.6)

## D. Privacy labels (cohérents avec PRIVACY.md + FAQ landing)

| Déclaration | Play (Data safety) | Apple (Nutrition) |
|---|---|---|
| Données collectées | email, pseudo, faculté, progression, id device | Contact Info, Identifiers, Usage Data |
| Données partagées avec des tiers | Aucune vente ; paiement Chargily | Same |
| Chiffrement en transit | Oui (TLS) | Oui |
| Suppression de compte | Oui, in-app | Oui, in-app |
| Santé / biométrie / localisation précise | NON collectées | NON collectées |
| Audio | non collecté (transcription sur appareil) | non collecté |

- [ ] Les réponses des deux consoles correspondent EXACTEMENT au tableau
      (un écart = rejet probable + incohérence avec la FAQ publique)

## E. Revues techniques avant build

- [ ] `bash tools/scripts/phase13_checks.sh` vert (inclut check_store.py + pentest_prep.py)
- [ ] `dart test` complet sur machine CI (golden + adaptatifs + widgets IA)
- [ ] `cd backend && npm run test` vert (vitest)
- [ ] Ports STT/TTS natifs branchés au `main()` (speech_to_text / flutter_tts) + testés sur device physique FR et AR
- [ ] Notifications FCM/APNs de rétention testées en fenêtre 8h–22h (heure d'Alger)
- [ ] Paywall Chargily : paiement test en DZD sur sandbox puis 1 transaction réelle remboursée
- [ ] Version code pubspec incrémentée + CHANGELOG v0.1.0

## F. Pen test externe (canal = SECURITY.md §1)

- [ ] Périmètre transmis = §1 de `tools/scripts/pentest_prep.py` (rapport généré)
- [ ] Correctifs critiques avec repro + test de non-régression adossé au rapport chiffré du prestataire
- [ ] Lettre d'attestation archivée dans `store/attestations/`

## G. Go / No-Go

- [ ] 0 vulnérabilité critique ouverte · tests CI verts · SLO Phase 17 tenus en staging 7 jours
- [ ] Validation produit (owner) + validation juridique (PRIVACY.md vs labels) + validation médicale (contenu, reviewer agréé)
