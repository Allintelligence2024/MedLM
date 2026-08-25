/// Magic link par email — P0 (magic link à usage unique).
///
/// Protocole :
///   1. POST /v1/auth/magic-link { email } → demande un lien ;
///   2. Le serveur génère un token aléatoire (>= 256 bits), n'en stocke
///      QUE l'empreinte SHA-256 (`token_hash`) dans `auth_challenges`,
///      avec une expiration de 15 min ;
///   3. L'email contient le lien /auth/magic?token=… ;
///   4. Le clique déclenche POST /v1/auth/magic-link/verify { token } ;
///   5. Le serveur consomme le défi de façon ATOMIQUE
///      (UPDATE … WHERE used_at IS NULL AND expires_at > now()) :
///      - un seul des appels concurrents réussit ;
///      - tout rejeu (même token) ou token expiré est refusé.
///
/// Réponse NEUTRE : la demande renvoie toujours `{ sent: true }`,
/// qu'un compte existe ou non (anti-énumération). Le rate limiting
/// (5 demandes / 15 min / email ET / IP) est appliqué côté serveur.
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { DRIZZLE, Database } from '../db/database.module';
import { users, authChallenges } from '../db/schema';
import { TokenResponse } from './auth.dto';
import { AuthService } from './auth.service';

/// Interface minimale du fournisseur d'email (mockable en test).
export interface EmailSender {
  send(args: { to: string; subject: string; html: string }): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

const TOKEN_BYTES = 32; // 256 bits d'entropie
const TTL_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly auth: AuthService,
  ) {}

  /// Demande un magic link. Réponse toujours neutre ({ sent: true }).
  async request(args: { email: string; ip?: string | undefined }): Promise<{ sent: true }> {
    const email = args.email.toLowerCase().trim();

    // Rate limiting : 5 demandes / 15 min par email ET par IP.
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS);
    const [byEmail, byIp] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(authChallenges)
        .where(and(eq(authChallenges.email, email), gt(authChallenges.createdAt, windowStart)))
        .then((r) => Number(r[0]?.value ?? 0)),
      args.ip
        ? this.db
            .select({ value: count() })
            .from(authChallenges)
            .where(
              and(eq(authChallenges.ipAddress, args.ip), gt(authChallenges.createdAt, windowStart)),
            )
            .then((r) => Number(r[0]?.value ?? 0))
        : 0,
    ]);

    if (byEmail >= RATE_LIMIT || byIp >= RATE_LIMIT) {
      this.logger.warn(`magic link rate limit atteint pour email=${email} ip=${args.ip ?? 'n/a'}`);
      // Neutre : on ne révèle pas que la limite est atteinte.
      return { sent: true };
    }

    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + TTL_MS);

    await this.db.insert(authChallenges).values({
      email,
      tokenHash,
      expiresAt,
      ipAddress: args.ip ?? null,
    });

    const base = this.config.get<string>('MAGIC_LINK_BASE_URL') ?? 'https://medanki.dz';
    const url = `${base}/auth/magic?token=${encodeURIComponent(token)}`;
    await this.email.send({
      to: email,
      subject: 'Votre lien de connexion MedAnki DZ',
      html: `<p>Cliquez sur le lien suivant pour vous connecter :</p>
<p><a href="${url}">${url}</a></p>
<p>Ce lien expire dans 15 minutes et ne peut être utilisé qu'une seule fois.</p>`,
    });
    return { sent: true };
  }

  /// Vérifie un magic token et émet access + refresh.
  /// Rejeté si : inexistant, expiré, ou déjà consommé (rejeu).
  async verify(args: { token: string; platform: string }): Promise<TokenResponse> {
    const tokenHash = createHash('sha256').update(args.token).digest('hex');

    const challenge = await this.db
      .select({ id: authChallenges.id, email: authChallenges.email })
      .from(authChallenges)
      .where(eq(authChallenges.tokenHash, tokenHash))
      .then((rows) => rows[0]);

    if (!challenge) {
      throw new NotFoundException('magic token invalide');
    }

    // Consommation atomique : un seul appel réussit.
    const consumed = await this.db
      .update(authChallenges)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(authChallenges.id, challenge.id),
          isNull(authChallenges.usedAt),
          gt(authChallenges.expiresAt, new Date()),
        ),
      );

    // drizzle renvoie le nombre de lignes affectées.
    const affected = (consumed as unknown as { rowCount?: number }).rowCount ?? 0;
    if (affected === 0) {
      throw new NotFoundException('magic token déjà utilisé ou expiré');
    }

    return this.issueForEmail(challenge.email, args.platform);
  }

  /// Trouve ou crée l'utilisateur rattaché à l'email du défi, puis émet
  /// les tokens. Le magic link est le seul chemin de création de compte.
  private async issueForEmail(email: string, platform: string): Promise<TokenResponse> {
    let user = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .then((rows) => rows[0]);
    if (!user) {
      const [created] = await this.db.insert(users).values({ email }).returning();
      user = created;
    }
    return this.auth.issueAccessFor(user!.id, platform);
  }
}
