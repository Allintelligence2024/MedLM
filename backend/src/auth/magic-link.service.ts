/// Magic link par email — challenge persistant, expirant et à usage unique.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { DRIZZLE, Database } from '../db/database.module';
import { authChallenges, users } from '../db/schema';
import { AuthSession } from './auth.service';
import { AuthService } from './auth.service';
import { DEFAULT_LANG, I18n, isSupported, type Lang } from '../i18n/i18n';

export interface EmailSender {
  send(args: { to: string; subject: string; html: string }): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
const CHALLENGE_TTL_MS = 15 * 60 * 1000;

/// Construit l'URL cliquable. Le CMS n'écoute pas `/auth/magic`.
export function magicLinkHref(args: {
  token: string;
  platform: string;
  appBase: string;
  cmsBase?: string;
}): string {
  const token = encodeURIComponent(args.token);
  if (args.platform === 'cms') {
    const base = (args.cmsBase || args.appBase).replace(/\/$/, '');
    return `${base}/admin/login?token=${token}`;
  }
  const base = args.appBase.replace(/\/$/, '');
  return `${base}/auth/magic?token=${token}`;
}

@Injectable()
export class MagicLinkService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly auth: AuthService,
    private readonly i18n: I18n,
  ) {}

  async request(args: { email: string; platform?: string }): Promise<{ sent: true }> {
    const email = args.email.trim().toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.db.insert(authChallenges).values({
      email,
      tokenHash,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

    const cmsBase = this.config.get<string>('MAGIC_LINK_CMS_URL');
    const url = magicLinkHref({
      token,
      platform: args.platform ?? 'web',
      appBase: this.config.get<string>('MAGIC_LINK_BASE_URL') ?? 'https://medanki.dz',
      ...(cmsBase ? { cmsBase } : {}),
    });
    const existing = await this.db
      .select({ langPref: users.langPref })
      .from(users)
      .where(eq(users.email, email))
      .then((rows) => rows[0]);
    const lang: Lang =
      existing && isSupported(existing.langPref) ? existing.langPref : DEFAULT_LANG;
    const subject = this.i18n.t(lang, 'auth.magic_link.subject');
    const body = this.i18n.t(lang, 'auth.magic_link.body', { url });
    // Même réponse pour toute adresse : pas d'énumération de comptes.
    await this.email.send({
      to: email,
      subject,
      html: `<p>${body}</p><p><a href="${url}">${url}</a></p>`,
    });
    return { sent: true };
  }

  async verify(args: {
    token: string;
    platform: string;
    deviceToken?: string;
  }): Promise<AuthSession> {
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
    return this.auth.issueAccessFor(userId, args.platform, args.deviceToken);
  }
}
