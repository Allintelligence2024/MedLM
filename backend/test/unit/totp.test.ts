import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { hotp, totp, totpCounter, verifyTotp, base32Encode } from '../../src/auth/totp';

const RFC_SECRET = Buffer.from('12345678901234567890');

describe('TOTP RFC 6238', () => {
  it('t=59s SHA1 8 chiffres = 94287082 (appendice B)', () => {
    expect(totp(RFC_SECRET, 59_000, 8)).toBe('94287082');
  });

  it('t=59s SHA1 6 chiffres = 287082', () => {
    expect(totp(RFC_SECRET, 59_000, 6)).toBe('287082');
  });

  it('autres vecteurs SHA1 8 chiffres de l’appendice B', () => {
    expect(totp(RFC_SECRET, 1_111_111_109 * 1000, 8)).toBe('07081804');
    expect(totp(RFC_SECRET, 1_111_111_111 * 1000, 8)).toBe('14050471');
    expect(totp(RFC_SECRET, 1_234_567_890 * 1000, 8)).toBe('89005924');
    expect(totp(RFC_SECRET, 2_000_000_000 * 1000, 8)).toBe('69279037');
  });

  it('le compteur est en secondes unix / 30, pas en millisecondes', () => {
    expect(totpCounter(59_000)).toBe(1n);
    expect(hotp(RFC_SECRET, 1n, 6)).toBe('287082');
  });

  it('l’algorithme Drive (SHA1 simple, nowMs/30) ne produit PAS 287082', () => {
    const nowMs = 59_000;
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / 30)));
    const digest = createHash('sha1').update(RFC_SECRET).update(counter).digest();
    const offset = digest[digest.length - 1]! & 15;
    const batch = String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
    const hmac = createHmac('sha1', RFC_SECRET)
      .update(Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]))
      .digest();
    expect(batch).toBe('119679');
    expect(batch).not.toBe('287082');
    expect(hmac).not.toEqual(digest);
  });

  it('refuse un code déjà consommé (last_counter)', () => {
    const code = totp(RFC_SECRET, 59_000);
    const first = verifyTotp({ secret: RFC_SECRET, code, nowMs: 59_000 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = verifyTotp({
      secret: RFC_SECRET,
      code,
      nowMs: 59_000,
      lastCounter: first.counter,
    });
    expect(replay.ok).toBe(false);
  });

  it('accepte le pas adjacent (±1)', () => {
    const previous = totp(RFC_SECRET, 59_000);
    expect(verifyTotp({ secret: RFC_SECRET, code: previous, nowMs: 89_000 }).ok).toBe(true);
  });

  it('base32 est stable pour un secret connu', () => {
    expect(base32Encode(Buffer.from([0x66, 0x6f, 0x6f]))).toMatch(/^[A-Z2-7]+$/);
  });
});
