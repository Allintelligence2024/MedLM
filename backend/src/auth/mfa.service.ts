/// MFA admin : TOTP RFC 6238, secret chiffré AES-256-GCM, backups atomiques.
import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { adminMfa, adminMfaBackupCodes, users } from '../db/schema';
import { auditLog } from '../db/schema/billing';
import { base32Encode, generateSecret, otpauthUrl, verifyTotp } from './totp';

const BACKUP_COUNT = 8;

@Injectable()
export class MfaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.db
      .select({ enabled: adminMfa.enabled })
      .from(adminMfa)
      .where(eq(adminMfa.userId, userId))
      .then((rows) => rows[0]);
    return Boolean(row?.enabled);
  }

  async setup(args: { enrollmentToken: string }): Promise<{
    otpauth_url: string;
    secret_base32: string;
  }> {
    const user = await this.requireKind(args.enrollmentToken, 'mfa_enroll');
    if (await this.isEnabled(user.sub)) {
      throw new ForbiddenException('MFA déjà actif');
    }
    const secret = generateSecret();
    const sealed = this.seal(secret);
    await this.db
      .insert(adminMfa)
      .values({
        userId: user.sub,
        secretCiphertext: sealed.ciphertext,
        secretIv: sealed.iv,
        secretTag: sealed.tag,
        enabled: false,
        lastCounter: null,
      })
      .onConflictDoUpdate({
        target: adminMfa.userId,
        set: {
          secretCiphertext: sealed.ciphertext,
          secretIv: sealed.iv,
          secretTag: sealed.tag,
          enabled: false,
          lastCounter: null,
          confirmedAt: null,
        },
      });
    await this.audit(user.sub, 'mfa.setup', {});
    return {
      otpauth_url: otpauthUrl({ email: user.email, secret }),
      secret_base32: base32Encode(secret),
    };
  }

  async enable(args: { enrollmentToken: string; code: string }): Promise<{
    userId: string;
    backup_codes: string[];
  }> {
    const user = await this.requireKind(args.enrollmentToken, 'mfa_enroll');
    const row = await this.load(user.sub);
    if (!row) throw new UnauthorizedException('enrôlement MFA absent');
    if (row.enabled) throw new ForbiddenException('MFA déjà actif');
    const secret = this.open(row);
    const check = verifyTotp({ secret, code: args.code, nowMs: Date.now() });
    if (!check.ok) throw new UnauthorizedException('code TOTP invalide');
    const backups = this.generateBackupCodes();
    await this.db.transaction(async (tx) => {
      await tx
        .update(adminMfa)
        .set({
          enabled: true,
          lastCounter: check.counter,
          confirmedAt: new Date(),
        })
        .where(eq(adminMfa.userId, user.sub));
      await tx.delete(adminMfaBackupCodes).where(eq(adminMfaBackupCodes.userId, user.sub));
      await tx.insert(adminMfaBackupCodes).values(
        backups.map((code) => ({
          userId: user.sub,
          codeHash: this.hashBackup(code),
        })),
      );
      await tx.insert(auditLog).values({
        actorUserId: user.sub,
        action: 'mfa.enable',
        targetType: 'user',
        targetId: user.sub,
        metadata: {},
      });
    });
    return { userId: user.sub, backup_codes: backups };
  }

  async verify(args: {
    mfaToken: string;
    code?: string;
    backupCode?: string;
  }): Promise<{ userId: string }> {
    const user = await this.requireKind(args.mfaToken, 'mfa_pending');
    if (args.backupCode) {
      await this.consumeBackup(user.sub, args.backupCode);
      return { userId: user.sub };
    }
    if (!args.code) throw new UnauthorizedException('code TOTP requis');
    const row = await this.load(user.sub);
    if (!row?.enabled) throw new UnauthorizedException('MFA inactif');
    const secret = this.open(row);
    const check = verifyTotp({
      secret,
      code: args.code,
      nowMs: Date.now(),
      lastCounter: row.lastCounter != null ? BigInt(row.lastCounter) : null,
    });
    if (!check.ok) {
      await this.audit(user.sub, 'mfa.verify_failed', {});
      throw new UnauthorizedException('code TOTP invalide');
    }
    await this.db
      .update(adminMfa)
      .set({ lastCounter: check.counter })
      .where(eq(adminMfa.userId, user.sub));
    await this.audit(user.sub, 'mfa.verify', {});
    return { userId: user.sub };
  }

  /// Rotation TOTP : l'ancien secret reste actif jusqu'à confirmation.
  async beginReplace(args: {
    userId: string;
    currentCode: string;
  }): Promise<{ otpauth_url: string; secret_base32: string }> {
    const row = await this.load(args.userId);
    if (!row?.enabled) throw new ForbiddenException('MFA inactif');
    const secret = this.open(row);
    const check = verifyTotp({
      secret,
      code: args.currentCode,
      nowMs: Date.now(),
      lastCounter: row.lastCounter != null ? BigInt(row.lastCounter) : null,
    });
    if (!check.ok) throw new UnauthorizedException('code TOTP invalide');
    const next = generateSecret();
    const sealed = this.seal(next);
    const email = await this.emailOf(args.userId);
    await this.db
      .update(adminMfa)
      .set({
        lastCounter: check.counter,
        pendingCiphertext: sealed.ciphertext,
        pendingIv: sealed.iv,
        pendingTag: sealed.tag,
        pendingCreatedAt: new Date(),
      })
      .where(eq(adminMfa.userId, args.userId));
    await this.audit(args.userId, 'mfa.replace_begin', {});
    return {
      otpauth_url: otpauthUrl({ email, secret: next }),
      secret_base32: base32Encode(next),
    };
  }

  async confirmReplace(args: {
    userId: string;
    newCode: string;
  }): Promise<{ backup_codes: string[] }> {
    const row = await this.load(args.userId);
    if (!row?.enabled) throw new ForbiddenException('MFA inactif');
    const pendingCiphertext = row.pendingCiphertext;
    const pendingIv = row.pendingIv;
    const pendingTag = row.pendingTag;
    const pendingCreatedAt = row.pendingCreatedAt;
    if (!pendingCiphertext || !pendingIv || !pendingTag || !pendingCreatedAt) {
      throw new UnauthorizedException('aucun remplacement en cours');
    }
    const ageMs = Date.now() - pendingCreatedAt.getTime();
    if (ageMs > 10 * 60 * 1000) {
      throw new UnauthorizedException('remplacement expiré');
    }
    const pending = this.open({
      secretCiphertext: pendingCiphertext,
      secretIv: pendingIv,
      secretTag: pendingTag,
    });
    const check = verifyTotp({ secret: pending, code: args.newCode, nowMs: Date.now() });
    if (!check.ok) throw new UnauthorizedException('nouveau code TOTP invalide');
    const backups = this.generateBackupCodes();
    await this.db.transaction(async (tx) => {
      await tx
        .update(adminMfa)
        .set({
          secretCiphertext: pendingCiphertext,
          secretIv: pendingIv,
          secretTag: pendingTag,
          lastCounter: check.counter,
          pendingCiphertext: sql`NULL`,
          pendingIv: sql`NULL`,
          pendingTag: sql`NULL`,
          pendingCreatedAt: sql`NULL`,
          confirmedAt: new Date(),
          enabled: true,
        })
        .where(eq(adminMfa.userId, args.userId));
      await tx.delete(adminMfaBackupCodes).where(eq(adminMfaBackupCodes.userId, args.userId));
      await tx.insert(adminMfaBackupCodes).values(
        backups.map((code) => ({
          userId: args.userId,
          codeHash: this.hashBackup(code),
        })),
      );
      await tx.insert(auditLog).values({
        actorUserId: args.userId,
        action: 'mfa.replace_confirm',
        targetType: 'user',
        targetId: args.userId,
        metadata: {},
      });
    });
    return { backup_codes: backups };
  }

  private async consumeBackup(userId: string, code: string): Promise<void> {
    const hash = this.hashBackup(code.trim());
    const consumed = await this.db
      .update(adminMfaBackupCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(adminMfaBackupCodes.userId, userId),
          eq(adminMfaBackupCodes.codeHash, hash),
          isNull(adminMfaBackupCodes.usedAt),
        ),
      )
      .returning({ id: adminMfaBackupCodes.id });
    if (consumed.length !== 1) {
      await this.audit(userId, 'mfa.backup_failed', {});
      throw new UnauthorizedException('code de secours invalide');
    }
    await this.audit(userId, 'mfa.backup', {});
  }

  private async requireKind(
    token: string,
    kind: 'mfa_enroll' | 'mfa_pending',
  ): Promise<{ sub: string; email: string }> {
    let payload: { sub?: string; kind?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('jeton MFA invalide');
    }
    if (payload.kind !== kind || !payload.sub) {
      throw new UnauthorizedException('jeton MFA de mauvais type');
    }
    const row = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, payload.sub))
      .then((rows) => rows[0]);
    if (!row) throw new UnauthorizedException('utilisateur inconnu');
    return { sub: payload.sub, email: row.email };
  }

  private async load(userId: string) {
    return this.db
      .select()
      .from(adminMfa)
      .where(eq(adminMfa.userId, userId))
      .then((rows) => rows[0]);
  }

  private async emailOf(userId: string): Promise<string> {
    const row = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);
    if (!row) throw new UnauthorizedException('utilisateur inconnu');
    return row.email;
  }

  private kek(): Buffer {
    const hex = this.config.get<string>('MFA_KEK') ?? process.env.MFA_KEK ?? '';
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new ServiceUnavailableException('MFA_KEK absent ou invalide (32 octets hex)');
    }
    return Buffer.from(hex, 'hex');
  }

  private seal(plain: Buffer): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.kek(), iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return { ciphertext, iv, tag: cipher.getAuthTag() };
  }

  private open(row: {
    secretCiphertext: Buffer;
    secretIv: Buffer;
    secretTag: Buffer;
  }): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', this.kek(), row.secretIv);
    decipher.setAuthTag(row.secretTag);
    return Buffer.concat([decipher.update(row.secretCiphertext), decipher.final()]);
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: BACKUP_COUNT }, () => randomBytes(5).toString('base64url'));
  }

  private hashBackup(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private async audit(userId: string, action: string, metadata: Record<string, unknown>) {
    await this.db.insert(auditLog).values({
      actorUserId: userId,
      action,
      targetType: 'user',
      targetId: userId,
      metadata,
    });
  }
}
