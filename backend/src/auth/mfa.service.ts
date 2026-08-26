/// MFA admin — TOTP (RFC 6238) + backup codes.
///
/// Protocole :
///   1. L'admin appelle POST /v1/auth/mfa/setup → serveur génère un secret
///      TOTP et 10 backup codes, stocke le secret hashé et les backup
///      codes hashés dans `users`, et retourne l'otpauth_url + les backup
///      codes en clair (une seule fois).
///   2. L'admin scanne le QR code, puis appelle POST /v1/auth/mfa/enable
///      avec un code TOTP valide → serveur valide, puis passe
///      `mfa_enabled = true`.
///   3. À la connexion, si l'admin a `mfa_enabled = true`, le JWT contient
///      `mfa_verified: false`. Un guard dédié bloque les routes admin
///      jusqu'à ce que l'utilisateur appelle POST /v1/auth/mfa/verify avec
///      un code TOTP ou un backup code valide → nouveau JWT avec
///      `mfa_verified: true`.
import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { DRIZZLE, Database } from '../db/database.module';
import { users } from '../db/schema';
import { AuthService } from './auth.service';

const TOTP_SECRET_BYTES = 20; // 160 bits
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const BACKUP_CODES_COUNT = 10;
const BACKUP_CODE_BYTES = 6;

function base32Encode(buf: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let val = 0;
  let out = '';
  for (const b of buf) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += alphabet[(val << (5 - bits)) & 31];
  }
  while (out.length % 8 !== 0) {
    out += '=';
  }
  return out;
}

function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let val = 0;
  const bytes: number[] = [];
  for (const ch of str.toUpperCase().replace(/=+$/, '')) {
    const v = alphabet.indexOf(ch);
    if (v < 0) continue;
    val = (val << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateMfaSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

export function computeTOTP(secretBase32: string, nowMs = Date.now()): string {
  const secret = base32Decode(secretBase32);
  const epoch = Math.floor(nowMs / TOTP_PERIOD);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(epoch));
  const digest = createHash('sha1').update(secret).update(counterBuf).digest();
  const hmac = Buffer.from(digest.buffer as ArrayBuffer, digest.byteOffset, digest.byteLength);
  const offset = hmac[hmac.length - 1]! & 0xf;
  const a = hmac[offset]!;
  const b = hmac[offset + 1]!;
  const c = hmac[offset + 2]!;
  const d = hmac[offset + 3]!;
  const code = ((a & 0x7f) << 24) | ((b & 0xff) << 16) | ((c & 0xff) << 8) | d;
  return (code % 1000000).toString().padStart(TOTP_DIGITS, '0');
}

export function verifyTOTP(secretBase32: string, token: string, nowMs = Date.now()): boolean {
  const secret = base32Decode(secretBase32);
  const epoch = Math.floor(nowMs / TOTP_PERIOD);
  for (let i = -1; i <= 1; i++) {
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(epoch + i));
    const digest = createHash('sha1').update(secret).update(counterBuf).digest();
    const hmac = Buffer.from(digest.buffer as ArrayBuffer, digest.byteOffset, digest.byteLength);
    const offset = hmac[hmac.length - 1]! & 0xf;
    const a = hmac[offset]!;
    const b = hmac[offset + 1]!;
    const c = hmac[offset + 2]!;
    const d = hmac[offset + 3]!;
    const code = ((a & 0x7f) << 24) | ((b & 0xff) << 16) | ((c & 0xff) << 8) | d;
    const digits = code % 1000000;
    if (digits.toString().padStart(TOTP_DIGITS, '0') === token) {
      return true;
    }
  }
  return false;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class MfaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auth: AuthService,
  ) {}

  getAuthService(): AuthService {
    return this.auth;
  }

  async setup(userId: string): Promise<{ secret: string; otpauthUrl: string; backupCodes: string[] }> {
    const user = await this.findUser(userId);
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA déjà activé');
    }

    const secret = generateMfaSecret();
    const backupCodes: string[] = [];
    for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
      backupCodes.push(randomBytes(BACKUP_CODE_BYTES).toString('hex').slice(0, BACKUP_CODE_BYTES * 2));
    }

    const backupCodesHashed = backupCodes.map((c) => hashCode(c));

    await this.db
      .update(users)
      .set({
        mfaSecret: secret,
        mfaBackupCodes: backupCodesHashed,
      })
      .where(eq(users.id, userId));

    const issuer = 'MedLM';
    const email = user.email;
    const otpauthUrl = `otpauth://totp/${issuer}:${email}?secret=${secret}&issuer=${issuer}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;

    return { secret, otpauthUrl, backupCodes };
  }

  async enable(userId: string, code: string): Promise<void> {
    const user = await this.findUser(userId);
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA déjà activé');
    }
    if (!user.mfaSecret) {
      throw new BadRequestException('MFA non initialisé : appelez d\'abord /auth/mfa/setup');
    }

    const valid = verifyTOTP(user.mfaSecret!, code);
    if (!valid) {
      throw new BadRequestException('code TOTP invalide');
    }

    await this.db.update(users).set({ mfaEnabled: true }).where(eq(users.id, userId));
  }

  async verify(userId: string, code: string): Promise<boolean> {
    const user = await this.findUser(userId);
    if (!user.mfaEnabled) {
      return true;
    }

    // TOTP
    if (user.mfaSecret && verifyTOTP(user.mfaSecret, code)) {
      return true;
    }

    // Backup codes
    const codeHash = hashCode(code);
    const backupCodes = user.mfaBackupCodes ?? [];
    const idx = backupCodes.indexOf(codeHash);
    if (idx >= 0) {
      const remaining = backupCodes.filter((_, i) => i !== idx);
      await this.db
        .update(users)
        .set({ mfaBackupCodes: remaining.length > 0 ? remaining : null })
        .where(eq(users.id, userId));
      return true;
    }

    return false;
  }

  async disable(userId: string, code: string): Promise<void> {
    const valid = await this.verify(userId, code);
    if (!valid) {
      throw new BadRequestException('code invalide');
    }
    await this.db
      .update(users)
      .set({ mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null })
      .where(eq(users.id, userId));
  }

  async regenerateBackupCodes(userId: string, code: string): Promise<string[]> {
    const valid = await this.verify(userId, code);
    if (!valid) {
      throw new BadRequestException('code invalide');
    }

    const backupCodes: string[] = [];
    for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
      backupCodes.push(randomBytes(BACKUP_CODE_BYTES).toString('hex').slice(0, BACKUP_CODE_BYTES * 2));
    }
    const backupCodesHashed = backupCodes.map((c) => hashCode(c));

    await this.db
      .update(users)
      .set({ mfaBackupCodes: backupCodesHashed })
      .where(eq(users.id, userId));

    return backupCodes;
  }

  private async findUser(userId: string): Promise<typeof users.$inferSelect> {
    const row = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);
    if (!row) throw new NotFoundException('utilisateur introuvable');
    return row;
  }
}
