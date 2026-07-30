// generate_entitlement_keys.mjs
//
// Génère une paire RSA 2048 bits pour la signature des JWT
// d'entitlement. La clé privée reste sur le backend (secret), la
// clé publique est destinée au bundle mobile.
//
// Usage :
//   node backend/scripts/generate_entitlement_keys.mjs
//
// Sortie :
//   backend/keys/entitlement_private.pem (NE PAS COMMITER — gitignoré)
//   mobile/assets/keys/entitlement_public.pem (À COMMITER)
//
// Note : ce script est lancé avec Node natif (--experimental-* non
// requis). Il utilise crypto.generateKeyPair (Node 16+).

import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const PRIVATE_PATH = resolve(repoRoot, 'backend/keys/entitlement_private.pem');
const PUBLIC_PATH = resolve(repoRoot, 'mobile/assets/keys/entitlement_public.pem');

mkdirSync(dirname(PRIVATE_PATH), { recursive: true });
mkdirSync(dirname(PUBLIC_PATH), { recursive: true });

if (existsSync(PRIVATE_PATH) && !process.argv.includes('--force')) {
  console.error(`ERREUR : ${PRIVATE_PATH} existe déjà.`);
  console.error('Utiliser --force pour écraser (et invalider tous les JWT en circulation).');
  process.exit(1);
}

console.log('Génération de la paire RSA 2048 bits...');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync(PRIVATE_PATH, privateKey, { mode: 0o600 });
writeFileSync(PUBLIC_PATH, publicKey, { mode: 0o644 });

console.log(`✓ Clé privée : ${PRIVATE_PATH}`);
console.log(`✓ Clé publique : ${PUBLIC_PATH}`);
console.log('');
console.log('Prochaines étapes :');
console.log('  1. Configurer backend/.env :');
console.log('     ENTITLEMENT_JWT_PRIVATE_KEY_PATH=./keys/entitlement_private.pem');
console.log('     ENTITLEMENT_JWT_KEY_ID=v1   (bump à chaque rotation)');
console.log('  2. La clé publique ci-dessus est déjà bundlée côté mobile.');
console.log('  3. Rebuild et déployer le backend.');
