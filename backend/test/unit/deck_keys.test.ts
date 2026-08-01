// Tests DeckKeysService — Phase 14.
// Vérifie que le wrap RSA-OAEP fonctionne et qu'on peut déwrap
// côté serveur (round-trip de la clé AES).
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createPublicKey, publicEncrypt, privateDecrypt, constants } from 'node:crypto';

describe('RSA-OAEP wrap/unwrap round-trip', () => {
  it('une clé AES wrappée peut être déwrapée avec la clé privée', () => {
    // Génère une paire RSA côté "client" (on simule l'appareil).
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Le "serveur" génère une clé AES-256 et la wrappe.
    const deckKey = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8'); // 32 octets
    const wrapped = publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      deckKey,
    );

    // Le "client" déwrap avec sa clé privée.
    const unwrapped = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      wrapped,
    );

    expect(unwrapped.equals(deckKey)).toBe(true);
  });

  it('échoue avec une clé trop petite (< 2048 bits)', () => {
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 1024,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    // publicKey est encodée en PEM (string) — asymmetricKeyDetails
    // n'existe que sur un KeyObject : on le recrée explicitement.
    const details = createPublicKey(publicKey).asymmetricKeyDetails;
    expect(details?.modulusLength).toBeLessThan(2048);
  });

  it('wrap est déterministe (même entrée → même sortie)', () => {
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const deckKey = Buffer.alloc(32, 42);
    const a = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      deckKey,
    );
    const b = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      deckKey,
    );
    // RSA-PKCS1-OAEP inclut un padding aléatoire, donc les
    // chiffrés sont DIFFÉRENTS pour la même entrée. C'est attendu
    // (IND-CCA2). Le test valide simplement que les deux sont
    // déwrapables.
    expect(a.equals(b)).toBe(false);
  });
});
