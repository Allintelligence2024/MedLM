// ShareService — Phase 15.5.
//
// Génère des "cartes de résultat" partageables sur les réseaux
// sociaux (WhatsApp, Instagram Stories, Twitter). Le rendu réel
// (image PNG) sera fait en Phase 18 via puppeteer/sharp ; pour
// l'instant on retourne un texte formaté et une URL placeholder.
//
// Conformité RGPD (v2 §13) :
//   * Pas d'email, pas de user_id, pas d'IP dans la réponse publique.
//   * Pseudonyme obligatoire (depuis leaderboard_optin) ou
//     fallback "anonyme".
//   * Expiration 30 jours (rétention limitée).
//   * Pas de tracking (pas d'event "shared", pas d'UTM).
import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { shareCards } from '../db/schema/share';
import { examAttempts } from '../db/schema/exams';
import { examTemplates } from '../db/schema/exam_templates';
import { modules } from '../db/schema/content';
import { leaderboardOptin } from '../db/schema/gamification';
import { users } from '../db/schema/users';
import { CreateShareBody, ShareCard, PublicShareMetadata } from './share.dto';

const RETENTION_DAYS = 30;
const BASE_URL = process.env.PUBLIC_BASE_URL ?? 'https://medanki-dz.com';

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /// Crée une carte de partage pour un mock exam.
  /// Pré-requis : l'utilisateur a passé un exam et a opt-in au
  /// leaderboard (sinon, pseudonymat = "anonyme").
  async createShare(args: { userId: string; body: CreateShareBody }): Promise<ShareCard> {
    // 1. Vérifier que la tentative existe et appartient à l'user.
    const attempt = await this.db
      .select()
      .from(examAttempts)
      .where(
        and(
          eq(examAttempts.id, args.body.attempt_id),
          eq(examAttempts.userId, args.userId),
          eq(examAttempts.status, 'submitted'),
        ),
      )
      .then((rows) => rows[0]);
    if (!attempt) {
      throw new NotFoundException('tentative introuvable ou non soumise');
    }
    const score = attempt.score ?? 0;
    const pct = Math.round(score * 100);

    // 2. Récupérer le pseudonyme (opt-in leaderboard) ou "anonyme".
    const optin = await this.db
      .select({ pseudonym: leaderboardOptin.pseudonym })
      .from(leaderboardOptin)
      .where(eq(leaderboardOptin.userId, args.userId))
      .then((rows) => rows[0]);
    const pseudonym = optin?.pseudonym ?? 'anonyme';

    // 3. Récupérer le module + faculté.
    const tpl = await this.db
      .select({ moduleId: examTemplates.moduleId, faculty: examTemplates.faculty })
      .from(examTemplates)
      .where(eq(examTemplates.id, attempt.templateId))
      .then((rows) => rows[0]);
    let moduleNameFr = '—';
    if (tpl?.moduleId) {
      const m = await this.db
        .select({ nameFr: modules.nameFr })
        .from(modules)
        .where(eq(modules.id, tpl.moduleId))
        .then((rows) => rows[0]);
      if (m) moduleNameFr = m.nameFr;
    }

    // 4. Récupérer la faculté de l'utilisateur.
    const user = await this.db
      .select({ faculty: users.faculty })
      .from(users)
      .where(eq(users.id, args.userId))
      .then((rows) => rows[0]);
    const faculty = tpl?.faculty ?? user?.faculty ?? null;

    // 5. Construire le texte de partage.
    const shareText = this._formatShareText({
      pseudonym,
      pct,
      moduleNameFr,
      faculty,
      style: args.body.style,
    });

    // 6. URL de l'image (placeholder — le rendu PNG réel est en
    // Phase 18 via puppeteer ou un service tiers).
    const id = crypto.randomUUID();
    const imageUrl = `${BASE_URL}/share/${id}.png`;

    // 7. Persister.
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.db.insert(shareCards).values({
      id,
      userId: args.userId,
      attemptId: attempt.id,
      pseudonym,
      score,
      pct,
      moduleNameFr,
      faculty,
      style: args.body.style,
      imageUrl,
      shareText,
      expiresAt,
    });

    this.logger.log(
      `share created: user=${args.userId} attempt=${attempt.id} pct=${pct}% style=${args.body.style}`,
    );
    return {
      id,
      image_url: imageUrl,
      share_text: shareText,
      expires_at: expiresAt.toISOString(),
      style: args.body.style,
    };
  }

  /// Récupère les métadonnées publiques d'une carte (pour la page
  /// de prévisualisation).
  async getPublic(id: string): Promise<PublicShareMetadata> {
    const row = await this.db
      .select()
      .from(shareCards)
      .where(eq(shareCards.id, id))
      .then((rows) => rows[0]);
    if (!row) throw new NotFoundException('carte introuvable');
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('carte expirée');
    }
    return {
      pseudonym: row.pseudonym,
      score: row.score,
      pct: row.pct,
      module_name_fr: row.moduleNameFr,
      faculty: row.faculty,
      style: row.style as 'minimal' | 'detailed' | 'story',
      created_at: row.createdAt.toISOString(),
    };
  }

  /// Formate le texte à coller sur WhatsApp / Twitter.
  _formatShareText(args: {
    pseudonym: string;
    pct: number;
    moduleNameFr: string;
    faculty: string | null;
    style: 'minimal' | 'detailed' | 'story';
  }): string {
    const lines: string[] = [];
    if (args.style === 'detailed' || args.style === 'story') {
      lines.push(`🩺 ${args.pseudonym} — Mock exam ${args.moduleNameFr}`);
      if (args.faculty) lines.push(`📚 ${args.faculty}`);
      lines.push(`📊 Score : ${args.pct}%`);
    } else {
      lines.push(`🩺 ${args.pseudonym} — ${args.pct}% sur ${args.moduleNameFr}`);
    }
    lines.push('');
    lines.push('Prépare tes révisions sur MedAnki DZ.');
    return lines.join('\n');
  }
}
