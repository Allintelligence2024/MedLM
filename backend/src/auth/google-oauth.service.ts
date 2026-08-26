/// OAuth2 Google — Phase 6.
///
/// Flow sécurisé :
///   1. L'app (mobile ou web) demande une URL d'autorisation :
///      GET /v1/auth/google → { url, state }
///   2. Le serveur génère un state aléatoire (>= 128 bits), stocke son
///      empreinte SHA-256 dans `auth_challenges`, avec une expiration
///      de 10 min.
///   3. L'app ouvre l'URL dans un WebView, Google redirige vers
///      GET /v1/auth/google/callback?code=…&state=…
///   4. Le serveur vérifie le state (atomique), échange le code contre
///      les tokens Google, valide l'email, crée ou retrouve le compte
///      MedAnki, émet access+refresh.
///   5. Le mobile utilise POST /v1/auth/google/token avec le code extrait
///      du WebView. Aucun token n'est jamais placé dans une query string.
///
/// On n'utilise PAS le SDK google-auth-library pour éviter 50 Mo de
/// dépendances transitive : un appel fetch direct à l'endpoint token
/// suffit. On valide `email` et `email_verified` (si présent) depuis
/// l'API userinfo.
import { Inject, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { oauthStates, users } from '../db/schema';
import { AuthService } from './auth.service';
import { TokenResponse } from './auth.dto';
import { createHash, randomBytes } from 'crypto';

const STATE_BYTES = 16; // 128 bits
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class GoogleOAuthService {

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  /// Construit l'URL d'autorisation Google et un state à usage unique.
  async authorizationUrl(): Promise<{ url: string; state: string }> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const redirect = this.config.get<string>('GOOGLE_REDIRECT_URI');
    if (!clientId || !redirect) {
      throw new Error('GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI manquants');
    }
    const state = randomBytes(STATE_BYTES).toString('hex');
    const stateHash = createHash('sha256').update(state).digest('hex');
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);

    await this.db.insert(oauthStates).values({
      stateHash,
      expiresAt,
    }).onConflictDoNothing({
      target: [oauthStates.stateHash],
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state };
  }

  /// Échange un `code` Google contre access+refresh MedAnki.
  async handleCallback(args: {
    code: string;
    state: string;
    platform: string;
  }): Promise<TokenResponse> {
    // 1. Vérifier le state (atomique, à usage unique).
    const stateHash = createHash('sha256').update(args.state).digest('hex');
    const challenge = await this.db
      .select({ id: oauthStates.stateHash, email: oauthStates.stateHash })
      .from(oauthStates)
      .where(eq(oauthStates.stateHash, stateHash))
      .then((rows) => rows[0]);

    if (!challenge) {
      throw new BadRequestException('state invalide');
    }

    const consumed = await this.db
      .update(oauthStates)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(oauthStates.stateHash, stateHash),
          isNull(oauthStates.usedAt),
          gt(oauthStates.expiresAt, new Date()),
        ),
      );

    const affected = (consumed as unknown as { rowCount?: number }).rowCount ?? 0;
    if (affected === 0) {
      throw new BadRequestException('state déjà utilisé ou expiré');
    }

    // 2. Échange code → tokens Google
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')!;
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET')!;
    const redirect = this.config.get<string>('GOOGLE_REDIRECT_URI')!;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: args.code,
        grant_type: 'authorization_code',
        redirect_uri: redirect,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      throw new UnauthorizedException(`Google token endpoint: ${t}`);
    }
    const tokenJson = (await tokenRes.json()) as { access_token: string; id_token?: string };

    // 3. Vérifier l'email via userinfo (pas d'id_token par défaut).
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!uiRes.ok) {
      throw new UnauthorizedException(`Google userinfo: ${uiRes.status}`);
    }
    const ui = (await uiRes.json()) as { email: string; email_verified?: boolean; name?: string };

    if (!ui.email) {
      throw new UnauthorizedException('email manquant dans le profil Google');
    }
    if (ui.email_verified === false) {
      throw new UnauthorizedException('email Google non vérifié');
    }

    // 4. Crée ou retrouve l'utilisateur MedAnki
    let user = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ui.email))
      .then((rows) => rows[0]);
    if (!user) {
      const [created] = await this.db
        .insert(users)
        .values({ email: ui.email, displayName: ui.name ?? null })
        .returning();
      user = created;
    }
    return this.auth.issueAccessFor(user!.id, args.platform);
  }
}
