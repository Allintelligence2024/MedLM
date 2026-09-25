/// Magic link par email — challenge persistant, expirant et à usage unique.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { DRIZZLE, Database } from '../db/database.module';
import { authChallenges, users } from '../db/schema';
import { TokenResponse } from './auth.dto';
import { AuthService } from './auth.service';

export interface EmailSender {
  send(args: { to: string; subject: string; html: string }): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
const CHALLENGE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class MagicLinkService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly auth: AuthService,
  ) {}

  async request(args: { email: string }): Promise<{ sent: true }> {
    const email = args.email.trim().toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.db.insert(authChallenges).values({
      email,
      tokenHash,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

    const base = this.config.get<string>('MAGIC_LINK_BASE_URL') ?? 'https://medanki.dz';
    const url = `${base}/auth/magic?token=${encodeURIComponent(token)}`;
    // Même réponse pour toute adresse : pas d'énumération de comptes.
    await this.email.send({
      to: email,
      subject: 'Votre lien de connexion MedAnki DZ',
      html: `<p>Cliquez sur le lien suivant pour vous connecter :</p>
<p><a href="${url}">${url}</a></p>
<p>Ce lien expire dans 15 minutes et ne peut être utilisé qu'une fois.</p>`,
    });
    return { sent: true };
  }

  async verify(args: { token: string; platform: string }): Promise<TokenResponse> {
    const tokenHash = createHash('sha256').update(args.token).digest('hex');
    const userId = await this.db.transaction(async (tx) => {
      const challenge = await tx
        .select()
        .from(authChallenges)
        .where(
          and(
            eq(authChallenges.tokenHash, tokenHash),
            isNull(authChallenges.usedAt),
          ),
        )
        .then((rows) => rows[0]);
      if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
        throw new NotFoundException('token invalide ou expiré');
      }

      // Marquage dans la même transaction : deux requêtes concurrentes ne
      // doivent jamais pouvoir consommer le même lien.
      const consumed = await tx
        .update(authChallenges)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(authChallenges.id, challenge.id),
            isNull(authChallenges.usedAt),
          ),
        )
        .returning({ id: authChallenges.id });
      if (consumed.length !== 1) throw new NotFoundException('token déjà utilisé');

      let user = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, challenge.email))
        .then((rows) => rows[0]);
      if (!user) {
        const [created] = await tx
          .insert(users)
          .values({ email: challenge.email })
          .returning({ id: users.id });
        user = created;
      }
      if (!user) throw new NotFoundException('utilisateur introuvable');
      return user.id;
    });
    return this.auth.issueAccessFor(userId, args.platform);
  }
}
