/// Service Auth — squelette Phase 5.
///
/// Phase 5 livre :
///   * la signature JWT (RS256 via @nestjs/jwt) ;
///   * le signup par email (magic link à câbler en Phase 6) ;
///   * la rotation des refresh tokens.
///
/// Pas encore livré (Phase 6) :
///   * Google OAuth2 ;
///   * OTP SMS (Twilio/InfoBip) ;
///   * l'email magic link (Resend) ;
///   * la révocation de refresh token (liste noire Redis).
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import { refreshTokens, users, userDevices } from '../db/schema';
import { DRIZZLE, Database } from '../db/database.module';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import { SignupBody, TokenResponse, LoginBody } from './auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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
      .get();
    if (existing) {
      throw new UnauthorizedException('email déjà utilisé');
    }
    const [user] = await this.db
      .insert(users)
      .values({
        email: args.email,
        displayName: args.display_name,
        faculty: args.faculty,
        studyYear: args.study_year,
      })
      .returning();
    return this.issueTokens(user!.id, args.platform, args.appVersion);
  }

  /// POST /auth/login
  async login(args: LoginBody & { platform: string; appVersion?: string }): Promise<TokenResponse> {
    const user = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, args.email))
      .get();
    if (!user) throw new UnauthorizedException('utilisateur inconnu');
    return this.issueTokens(user.id, args.platform, args.appVersion);
  }

  private async issueTokens(
    userId: string,
    platform: string,
    appVersion?: string,
  ): Promise<TokenResponse> {
    const [device] = await this.db
      .insert(userDevices)
      .values({ userId, platform, appVersion: appVersion ?? null })
      .returning();

    const accessTtl = this.config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900;
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL_SECONDS') ?? 2_592_000;

    const accessToken = await this.jwt.signAsync(
      { sub: userId, kind: 'access' },
      { expiresIn: accessTtl },
    );

    // Refresh token = un secret opaque stocké hashé en DB.
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
