/// Service Auth — magic link / OAuth, refresh atomique, appareils, MFA admin.
import {
  ForbiddenException,
  Inject,
  Injectable,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { refreshTokens, users, userDevices, adminMfa } from '../db/schema';
import { DRIZZLE, Database } from '../db/database.module';
import { SignupBody, TokenResponse, LoginBody } from './auth.dto';
import { Role } from '../rbac/roles';

export const MAX_ACTIVE_DEVICES = 3;

export type AuthSession =
  | TokenResponse
  | { status: 'mfa_required'; mfa_token: string; expires_in: number }
  | { status: 'mfa_enrollment_required'; enrollment_token: string; expires_in: number };

async function resolveRole(
  db: Database,
  userId: string,
  email: string,
  config: ConfigService,
): Promise<Role> {
  const override = config.get<string>('ADMIN_EMAILS')?.split(',').map((s) => s.trim()) ?? [];
  if (override.includes(email)) return 'admin';
  const row = await db
    .select({ role: sql<string>`COALESCE(rbac_role, 'student')` })
    .from(users)
    .where(eq(users.id, userId))
    .then((rows) => rows[0]);
  return (row?.role as Role) ?? 'student';
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signup(_args: SignupBody & { platform: string; appVersion?: string }): Promise<TokenResponse> {
    throw new GoneException('inscription par email désactivée : utilisez le magic link');
  }

  async login(_args: LoginBody & { platform: string; appVersion?: string }): Promise<TokenResponse> {
    throw new GoneException('connexion par email désactivée : utilisez le magic link');
  }

  /// Login (magic link / Google) : les admins passent par MFA.
  async issueAccessFor(
    userId: string,
    platform: string,
    deviceToken?: string,
  ): Promise<AuthSession> {
    const user = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);
    if (!user) throw new UnauthorizedException('utilisateur inconnu');
    const role = await resolveRole(this.db, userId, user.email, this.config);
    if (role === 'admin') {
      const mfa = await this.db
        .select({ enabled: adminMfa.enabled })
        .from(adminMfa)
        .where(eq(adminMfa.userId, userId))
        .then((rows) => rows[0]);
      if (!mfa?.enabled) {
        const enrollment_token = await this.jwt.signAsync(
          { sub: userId, kind: 'mfa_enroll', role },
          { expiresIn: 600 },
        );
        return { status: 'mfa_enrollment_required', enrollment_token, expires_in: 600 };
      }
      const mfa_token = await this.jwt.signAsync(
        { sub: userId, kind: 'mfa_pending', role },
        { expiresIn: 300 },
      );
      return { status: 'mfa_required', mfa_token, expires_in: 300 };
    }
    return this.issueFullSession({ userId, platform, ...(deviceToken ? { deviceToken } : {}) });
  }

  /// Session complète (après MFA ou pour un non-admin). Utilisé aussi par refresh.
  async issueFullSession(args: {
    userId: string;
    platform: string;
    appVersion?: string;
    deviceId?: string;
    deviceToken?: string;
    db?: Database;
  }): Promise<TokenResponse> {
    const db = args.db ?? this.db;
    const user = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, args.userId))
      .then((rows) => rows[0]);
    if (!user) throw new UnauthorizedException('utilisateur inconnu');
    return this.issueTokens(db, args.userId, user.email, args);
  }

  /// POST /auth/refresh — CAS : un seul concurrent gagne la ligne.
  async refresh(args: { refreshToken: string; platform: string }): Promise<TokenResponse> {
    const tokenHash = createHash('sha256').update(args.refreshToken).digest('hex');
    return this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.tokenHash, tokenHash),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, new Date()),
          ),
        )
        .returning({
          userId: refreshTokens.userId,
          deviceId: refreshTokens.deviceId,
        });
      if (claimed[0]) {
        return this.issueFullSession({
          userId: claimed[0].userId,
          platform: args.platform,
          deviceId: claimed[0].deviceId,
          db: tx as unknown as Database,
        });
      }
      const existing = await tx
        .select({
          userId: refreshTokens.userId,
          revokedAt: refreshTokens.revokedAt,
        })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .then((rows) => rows[0]);
      if (existing?.revokedAt) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(refreshTokens.userId, existing.userId), isNull(refreshTokens.revokedAt)),
          );
        throw new UnauthorizedException('refresh token révoqué');
      }
      throw new UnauthorizedException('refresh token invalide');
    });
  }

  async logout(refreshToken: string): Promise<{ revoked: true }> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
    return { revoked: true };
  }

  async logoutAll(userId: string): Promise<{ revoked: number }> {
    const rows = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    return { revoked: rows.length };
  }

  async listDevices(userId: string) {
    const rows = await this.db
      .select({
        id: userDevices.id,
        platform: userDevices.platform,
        lastActive: userDevices.lastActive,
      })
      .from(userDevices)
      .where(eq(userDevices.userId, userId));
    return { items: rows.map((r) => ({ ...r, last_active: r.lastActive.toISOString() })) };
  }

  async revokeDevice(userId: string, deviceId: string): Promise<{ revoked: number }> {
    const rows = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.deviceId, deviceId),
          isNull(refreshTokens.revokedAt),
        ),
      )
      .returning({ id: refreshTokens.id });
    return { revoked: rows.length };
  }

  async me(userId: string) {
    const row = await this.db
      .select({ email: users.email, role: users.rbacRole })
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);
    if (!row) throw new UnauthorizedException('utilisateur inconnu');
    const role = await resolveRole(this.db, userId, row.email, this.config);
    return { user_id: userId, email: row.email, role };
  }

  private async issueTokens(
    db: Database,
    userId: string,
    email: string,
    args: { platform: string; appVersion?: string; deviceId?: string; deviceToken?: string },
  ): Promise<TokenResponse> {
    const device = await this.resolveDevice(db, userId, args);
    const accessTtl = Number(this.config.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
    const refreshTtl = Number(this.config.get('JWT_REFRESH_TTL_SECONDS') ?? 2_592_000);
    const role = await resolveRole(db, userId, email, this.config);

    const accessToken = await this.jwt.signAsync(
      { sub: userId, kind: 'access', role, did: device.id },
      { expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await db.insert(refreshTokens).values({
      userId,
      deviceId: device.id,
      tokenHash,
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user_id: userId,
      expires_in: accessTtl,
    };
  }

  private async resolveDevice(
    db: Database,
    userId: string,
    args: { platform: string; appVersion?: string; deviceId?: string; deviceToken?: string },
  ): Promise<{ id: string }> {
    if (args.deviceId) {
      await db
        .update(userDevices)
        .set({ lastActive: new Date(), platform: args.platform })
        .where(and(eq(userDevices.id, args.deviceId), eq(userDevices.userId, userId)));
      return { id: args.deviceId };
    }
    if (args.deviceToken) {
      const existing = await db
        .select({ id: userDevices.id })
        .from(userDevices)
        .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceToken, args.deviceToken)))
        .then((rows) => rows[0]);
      if (existing) {
        await db
          .update(userDevices)
          .set({ lastActive: new Date(), platform: args.platform })
          .where(eq(userDevices.id, existing.id));
        return existing;
      }
    }
    const active = await db
      .select({ n: sql<number>`count(distinct ${refreshTokens.deviceId})::int` })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .then((rows) => Number(rows[0]?.n ?? 0));
    if (active >= MAX_ACTIVE_DEVICES) {
      throw new ForbiddenException(`limite de ${MAX_ACTIVE_DEVICES} appareils atteinte`);
    }
    const [created] = await db
      .insert(userDevices)
      .values({
        userId,
        platform: args.platform,
        appVersion: args.appVersion ?? null,
        deviceToken: args.deviceToken ?? null,
      })
      .returning({ id: userDevices.id });
    return created!;
  }
}
