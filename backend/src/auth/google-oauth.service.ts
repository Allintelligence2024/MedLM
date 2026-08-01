/// OAuth2 Google — Phase 6.
///
/// Flow :
///   1. L'app (mobile ou web) demande une URL d'autorisation :
///      GET /v1/auth/google → { url: "https://accounts.google.com/..." }
///   2. L'utilisateur consent, Google redirige vers
///      GET /v1/auth/google/callback?code=…
///   3. Le serveur échange le code contre les tokens Google, récupère
///      l'email de l'utilisateur, crée ou retrouve le compte MedAnki,
///      émet access+refresh.
///
/// On n'utilise PAS le SDK google-auth-library pour éviter 50 Mo de
/// dépendances transitive : un appel fetch direct à l'endpoint token
/// suffit. La validation du `id_token` n'est pas faite ici (Phase 11,
/// CMS) — on fait confiance à l'email retourné par l'API userinfo.
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { users } from '../db/schema';
import { AuthService } from './auth.service';
import { TokenResponse } from './auth.dto';

@Injectable()
export class GoogleOAuthService {

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  /// Construit l'URL d'autorisation Google.
  authorizationUrl(args: { state: string }): string {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const redirect = this.config.get<string>('GOOGLE_REDIRECT_URI');
    if (!clientId || !redirect) {
      throw new Error('GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI manquants');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email profile',
      state: args.state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /// Échange un `code` Google contre access+refresh MedAnki.
  async handleCallback(args: {
    code: string;
    state: string;
    platform: string;
  }): Promise<TokenResponse> {
    // 1. Échange code → tokens Google
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
    const tokenJson = (await tokenRes.json()) as { access_token: string };

    // 2. userinfo
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!uiRes.ok) {
      throw new UnauthorizedException(`Google userinfo: ${uiRes.status}`);
    }
    const ui = (await uiRes.json()) as { email: string; name?: string };

    // 3. Crée ou retrouve l'utilisateur MedAnki
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
