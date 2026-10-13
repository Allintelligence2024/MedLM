/// TOTP RFC 6238 / HOTP RFC 4226 — HMAC-SHA1, pas un hash simple.
///
/// Le batch Drive faisait `SHA1(secret || compteur)` avec un compteur
/// en millisecondes. Ça n'est pas TOTP. Les vecteurs de l'appendice B
/// (secret ASCII 12345678901234567890, t=59s) donnent 287082 en 6
/// chiffres, 94287082 en 8. Ne pas « réparer » en recopiant le batch.
import { createHmac, randomBytes } from 'node:crypto';

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function hotp(
  secret: Buffer,
  counter: bigint,
  digits: number = TOTP_DIGITS,
): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const hmac = createHmac('sha1', secret).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin = hmac.readUInt32BE(offset) & 0x7fffffff;
  const mod = 10 ** digits;
  return String(bin % mod).padStart(digits, '0');
}

export function totpCounter(
  nowMs: number,
  step: number = TOTP_STEP_SECONDS,
): bigint {
  return BigInt(Math.floor(Math.floor(nowMs / 1000) / step));
}

export function totp(
  secret: Buffer,
  nowMs: number,
  digits: number = TOTP_DIGITS,
  step: number = TOTP_STEP_SECONDS,
): string {
  return hotp(secret, totpCounter(nowMs, step), digits);
}

export function verifyTotp(args: {
  secret: Buffer;
  code: string;
  nowMs: number;
  lastCounter?: bigint | null;
  digits?: number;
  window?: number;
}): { ok: true; counter: bigint } | { ok: false } {
  const digits = args.digits ?? TOTP_DIGITS;
  const window = args.window ?? TOTP_WINDOW;
  const expected = args.code.replace(/\s+/g, '');
  if (!new RegExp(`^[0-9]{${digits}}$`).test(expected)) return { ok: false };
  const center = totpCounter(args.nowMs);
  for (let delta = -window; delta <= window; delta++) {
    const counter = center + BigInt(delta);
    if (args.lastCounter !== undefined && args.lastCounter !== null && counter <= args.lastCounter) {
      continue;
    }
    if (hotp(args.secret, counter, digits) === expected) {
      return { ok: true, counter };
    }
  }
  return { ok: false };
}

export function generateSecret(bytes = 20): Buffer {
  return randomBytes(bytes);
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function otpauthUrl(args: {
  email: string;
  secret: Buffer;
  issuer?: string;
}): string {
  const issuer = args.issuer ?? 'MedAnki DZ';
  const label = encodeURIComponent(`${issuer}:${args.email}`);
  const params = new URLSearchParams({
    secret: base32Encode(args.secret),
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
