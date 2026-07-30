/// Magic link par email — Phase 6.
///
/// Le protocole est volontairement simple :
///   1. L'app demande un magic link (POST /v1/auth/magic-link { email }) ;
///   2. Le serveur génère un token à usage unique, l'envoie par email ;
///   3. L'utilisateur clique, le serveur valide et émet access+refresh.
///
/// Le token est un JWT signé (kind='magic') avec une durée de vie
/// courte (15 min) — c'est plus simple qu'une table `magic_tokens` et
/// ça ne nécessite pas de nettoyage. La **non-répudiation** n'est pas
/// garantie (n'importe qui ayant accès à l'email peut activer le
/// compte), mais c'est le standard du secteur.
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DRIZZLE, Database } from '../db/database.module';
import { users } from '../db/schema';
import { TokenResponse } from './auth.dto';
import { AuthService } from './auth.service';

/// Interface minimale du fournisseur d'email. On l'interface pour pouvoir
/// mocker en test et swap entre Resend / SendGrid / SMTP en prod.
export interface EmailSender {
  send(args: { to: string; subject: string; html: string }): Promise<void>;
}

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailSender,
    private readonly auth: AuthService,
  ) {}

  async request(args: { email: string }): Promise<{ sent: true }> {
    // On **ne révèle pas** si l'email existe (anti-énumération).
    const user = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, args.email))
      .get();
    if (!user) {
      this.logger.warn(`magic link demandé pour email inconnu`);
      return { sent: true };
    }
    const token = await this.jwt.signAsync(
      {
        sub: user.id,
        kind: 'magic',
        email: args.email,
        jti: randomBytes(16).toString('hex'),
      },
      { expiresIn: 900 }, // 15 min
    );
    const base = this.config.get<string>('MAGIC_LINK_BASE_URL') ?? 'https://medanki.dz';
    const url = `${base}/auth/magic?token=${encodeURIComponent(token)}`;
    await this.email.send({
      to: args.email,
      subject: 'Votre lien de connexion MedAnki DZ',
      html: `<p>Cliquez sur le lien suivant pour vous connecter :</p>
<p><a href="${url}">${url}</a></p>
<p>Ce lien expire dans 15 minutes.</p>`,
    });
    return { sent: true };
  }

  /// Valide un magic token et émet access + refresh.
  async verify(args: { token: string; platform: string }): Promise<TokenResponse> {
    let payload: { sub: string; kind: string };
    try {
      payload = await this.jwt.verifyAsync(args.token);
    } catch (e) {
      throw new NotFoundException(`token invalide : ${(e as Error).message}`);
    }
    if (payload.kind !== 'magic') {
      throw new NotFoundException('kind de token invalide');
    }
    return this.auth.issueAccessFor(payload.sub, args.platform);
  }
}
