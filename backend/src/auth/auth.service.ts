/// Service Auth — sign-up, login, magic link, OAuth2, refresh.
///
/// JWT payload inclut désormais le rôle RBAC (`role: 'student' | ...`)
/// pour permettre aux `@RbacGuard()` de décider côté contrôleur.
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { refreshTokens, users, userDevices } from '../db/schema';
import { DRIZZLE, Database } from '../db/database.module';
import { createHash, randomBytes } from 'crypto';
import { SignupBody, TokenResponse, LoginBody } from './auth.dto';
import { Role } from '../rbac/roles';

/// Lit le rôle de l'utilisateur depuis la DB. En MVP, le rôle est dans
/// la table `users` (colonne `rbac_role`, défaut 'student'). En Phase 11
/// (CMS) on ajoutera une UI pour modifier ça. Pour l'instant on a aussi
/// un override par email via `ADMIN_EMAILS` (CSV dans .env).
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

  /// POST /auth/signup
  async signup(args: SignupBody & { platform: string; appVersion?: string }): Promise<TokenResponse> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, args.email))
      .then((rows) => rows[0]);
    if (existing) {
      throw new UnauthorizedException('email déjà utilisé');
    }
    const [user] = await this.db
      .insert(users)
      .values({
        email: args.email,
        ...(args.display_name !== undefined && { displayName: args.display_name }),
        ...(args.faculty !== undefined && { faculty: args.faculty }),
        ...(args.study_year !== undefined && { studyYear: args.study_year }),
      })
      .returning();
    return this.issueTokens(user!.id, args.email, args.platform, args.appVersion);
  }

  /// POST /auth/login
  async login(args: LoginBody & { platform: string; appVersion?: string }): Promise<TokenResponse> {
    const user = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, args.email))
      .then((rows) => rows[0]);
    if (!user) throw new UnauthorizedException('utilisateur inconnu');
    return this.issueTokens(user.id, user.email, args.platform, args.appVersion);
  }

  /// Émet des tokens d'accès pour un userId connu (magic link / Google).
  async issueAccessFor(userId: string, platform: string): Promise<TokenResponse> {
    const user = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);
    if (!user) throw new UnauthorizedException('utilisateur inconnu');
    return this.issueTokens(userId, user.email, platform);
  }

  /// POST /auth/refresh — rotation du refresh token.
  async refresh(args: { refreshToken: string; platform: string }): Promise<TokenResponse> {
    const tokenHash = createHash('sha256').update(args.refreshToken).digest('hex');
    // Le jeton doit être NON RÉVOQUÉ et NON EXPIRÉ.
    //
    // Ces deux conditions manquaient (bug trouvé le 2026-08-01 en
    // rejouant un parcours réel) : `revokedAt` était bien positionné à
    // chaque rotation, mais jamais relu. Un refresh token restait donc
    // valable indéfiniment, y compris après sa révocation et au-delà de
    // son expiration — la rotation n'apportait AUCUNE protection.
    //
    // C'est précisément le scénario qu'elle est censée couvrir : un
    // jeton volé reste utilisable par l'attaquant même après que la
    // victime a rafraîchi sa session.
    const row = await this.db
      .select({ user: refreshTokens.userId, device: refreshTokens.deviceId })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .then((rows) => rows[0]);
    if (!row) throw new UnauthorizedException('refresh token invalide');
    const user = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, row.user))
      .then((rows) => rows[0]);
    if (!user) throw new UnauthorizedException('utilisateur inconnu');
    // Révoquer l'ancien (rotation, §6.1 v2).
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));
    return this.issueTokens(row.user, user.email, args.platform);
  }

  private async issueTokens(
    userId: string,
    email: string,
    platform: string,
    appVersion?: string,
  ): Promise<TokenResponse> {
    const [device] = await this.db
      .insert(userDevices)
      .values({ userId, platform, appVersion: appVersion ?? null })
      .returning();

    const accessTtl = this.config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900;
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL_SECONDS') ?? 2_592_000;
    const role = await resolveRole(this.db, userId, email, this.config);

    const accessToken = await this.jwt.signAsync(
      { sub: userId, kind: 'access', role },
      { expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.db.insert(refreshTokens).values({
      userId,
      deviceId: device!.id,
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
}
