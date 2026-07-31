// RetentionService — Phase 18.5 (détection de décrochage).
//
// Détecte les étudiants inactifs et envoie des alertes proactives via
// le système de notifications Phase 14 (FCM/Android, APNs/iOS) :
//   * 3-4 jours  → rappel doux ('gentle')
//   * 5-9 jours  → « streak cassé » ('streak_broken')
//   * ≥ 10 jours → réengagement ('reengagement')
//
// La fenêtre 8h-22h est déjà garantie par NotificationsService. On
// ajoute une déduplication : pas de renvoi du même niveau pendant
// 7 jours ; une escalade (niveau supérieur) est possible après 3 jours.
// Jamais de spam : c'est le frein principal au churn silencieux.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../db/database.module';
import { retentionAlerts } from '../../db/schema/ai';
import { users, userDevices } from '../../db/schema/users';
import { FSRS_MILLIS_PER_DAY } from '../../common/fsrs/fsrs.constants';
import {
  NotificationsService,
  isWithinNotificationWindow,
} from '../../notifications/notifications.service';
import { LlmLang } from '../llm/llm.types';
import {
  RetentionLevel,
  RetentionMessage,
  buildRetentionMessage,
} from './retention.messages';

/// Seuils documentés — changelog obligatoire en cas de modification.
export const RETENTION_THRESHOLDS = {
  GENTLE_MIN_DAYS: 3,
  STREAK_BROKEN_MIN_DAYS: 5,
  REENGAGEMENT_MIN_DAYS: 10,
  /// Cooldown anti-spam.
  SAME_LEVEL_COOLDOWN_DAYS: 7,
  ESCALATION_COOLDOWN_DAYS: 3,
  /// Taille max d'un lot de scan (protection mémoire ; cron paginera).
  SCAN_BATCH_LIMIT: 500,
} as const;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────── Logique pure (testée) ──────────────────────────

  static classifyInactivity(inactiveDays: number): RetentionLevel {
    if (inactiveDays >= RETENTION_THRESHOLDS.REENGAGEMENT_MIN_DAYS) {
      return 'reengagement';
    }
    if (inactiveDays >= RETENTION_THRESHOLDS.STREAK_BROKEN_MIN_DAYS) {
      return 'streak_broken';
    }
    if (inactiveDays >= RETENTION_THRESHOLDS.GENTLE_MIN_DAYS) {
      return 'gentle';
    }
    return 'none';
  }

  static levelScore(level: RetentionLevel): number {
    return { none: 0, gentle: 1, streak_broken: 2, reengagement: 3 }[level];
  }

  /// Anti-spam : cooldown 7 j même niveau, 3 j si escalade.
  static shouldNotify(args: {
    level: RetentionLevel;
    lastAlert: { level: RetentionLevel; notifiedAt: Date } | null;
    now: Date;
  }): boolean {
    if (args.level === 'none') return false;
    if (!args.lastAlert) return true;
    const daysSince =
      (args.now.getTime() - args.lastAlert.notifiedAt.getTime()) /
      FSRS_MILLIS_PER_DAY;
    if (daysSince >= RETENTION_THRESHOLDS.SAME_LEVEL_COOLDOWN_DAYS) return true;
    const escalation =
      RetentionService.levelScore(args.level) >
      RetentionService.levelScore(args.lastAlert.level);
    return escalation && daysSince >= RETENTION_THRESHOLDS.ESCALATION_COOLDOWN_DAYS;
  }

  static buildMessage(
    level: RetentionLevel,
    lang: LlmLang,
    ctx: { days: number; streakDays?: number },
  ): RetentionMessage {
    return buildRetentionMessage(level, lang, ctx);
  }

  // ─────────────────────── Orchestration DB ────────────────────────────────

  /// Candidats à l'alerte : utilisateurs inactifs ≥ GENTLE_MIN_DAYS.
  private async _loadCandidates(now: Date) {
    const cutoff = new Date(
      now.getTime() - RETENTION_THRESHOLDS.GENTLE_MIN_DAYS * FSRS_MILLIS_PER_DAY,
    );
    const rows = await this.db
      .select({
        id: users.id,
        langPref: users.langPref,
        lastSeenAt: users.lastSeenAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(lte(sql`coalesce(${users.lastSeenAt}, ${users.createdAt})`, cutoff))
      .limit(RETENTION_THRESHOLDS.SCAN_BATCH_LIMIT);
    return rows.map((u) => {
      const lastActivity = u.lastSeenAt ?? u.createdAt;
      const inactiveDays = Math.floor(
        (now.getTime() - lastActivity.getTime()) / FSRS_MILLIS_PER_DAY,
      );
      return {
        userId: u.id,
        lang: (['fr', 'ar', 'en'].includes(u.langPref) ? u.langPref : 'fr') as LlmLang,
        inactiveDays,
        level: RetentionService.classifyInactivity(inactiveDays),
      };
    });
  }

  private async _lastAlertFor(userId: string) {
    const [row] = await this.db
      .select({
        level: retentionAlerts.level,
        notifiedAt: retentionAlerts.notifiedAt,
      })
      .from(retentionAlerts)
      .where(eq(retentionAlerts.userId, userId))
      .orderBy(desc(retentionAlerts.notifiedAt))
      .limit(1);
    return row
      ? { level: row.level as RetentionLevel, notifiedAt: row.notifiedAt }
      : null;
  }

  /// GET /v1/ai/retention/preview — qui serait alerté, sans envoyer.
  async previewRun(now: Date = new Date()) {
    const candidates = await this._loadCandidates(now);
    const out: Array<{
      user_id: string;
      level: RetentionLevel;
      inactive_days: number;
      would_notify: boolean;
    }> = [];
    for (const c of candidates) {
      const last = await this._lastAlertFor(c.userId);
      out.push({
        user_id: c.userId,
        level: c.level,
        inactive_days: c.inactiveDays,
        would_notify: RetentionService.shouldNotify({
          level: c.level,
          lastAlert: last,
          now,
        }),
      });
    }
    return {
      generated_at: now.toISOString(),
      within_window: isWithinNotificationWindow(now),
      total_candidates: candidates.length,
      levels: {
        gentle: out.filter((c) => c.level === 'gentle').length,
        streak_broken: out.filter((c) => c.level === 'streak_broken').length,
        reengagement: out.filter((c) => c.level === 'reengagement').length,
      },
      candidates: out,
    };
  }

  /// POST /v1/ai/retention/scan — exécute le balayage et envoie les alertes.
  /// Hors fenêtre 8h-22h → exécution différée (rien n'est envoyé ni
  /// comptabilisé : le prochain scan dans la fenêtre reprendra).
  async runScan(now: Date = new Date()) {
    if (!isWithinNotificationWindow(now)) {
      return {
        deferred: true as const,
        reason: 'outside_window',
        window: '08:00-22:00',
        sent: 0,
      };
    }

    const candidates = await this._loadCandidates(now);
    let notified = 0;
    let messages = 0;
    const perLevel = { gentle: 0, streak_broken: 0, reengagement: 0 };

    for (const c of candidates) {
      const last = await this._lastAlertFor(c.userId);
      if (
        !RetentionService.shouldNotify({ level: c.level, lastAlert: last, now })
      ) {
        continue;
      }

      const devices = await this.db
        .select({
          platform: userDevices.platform,
          deviceToken: userDevices.deviceToken,
        })
        .from(userDevices)
        .where(
          sql`${userDevices.userId} = ${c.userId} AND ${isNotNull(userDevices.deviceToken)}`,
        );
      if (devices.length === 0) continue;

      const msg = RetentionService.buildMessage(c.level, c.lang, {
        days: c.inactiveDays,
      });
      let sent = 0;
      for (const d of devices) {
        const platform =
          d.platform === 'ios' ? 'ios' : d.platform === 'web' ? 'web' : 'android';
        const result = await this.notifications.send({
          platform,
          deviceToken: d.deviceToken!,
          payload: {
            title: msg.title,
            body: msg.body,
            kind: 'retention_alert',
            deeplink: 'medanki://study/quick',
          },
        });
        if (result.sent) sent += 1;
      }

      if (sent > 0) {
        // On ne consigne que les alertes réellement parties : la
        // déduplication reflète la réalité, un échec provider retente.
        await this.db.insert(retentionAlerts).values({
          userId: c.userId,
          level: c.level,
          channels: sent,
          notifiedAt: now,
        });
        notified += 1;
        messages += sent;
        perLevel[c.level as keyof typeof perLevel] += 1;
      }
    }

    this.logger.log(
      `retention scan: candidates=${candidates.length} notified=${notified} messages=${messages}`,
    );
    return {
      deferred: false as const,
      total_candidates: candidates.length,
      users_notified: notified,
      notifications_sent: messages,
      per_level: perLevel,
      sent: messages,
    };
  }
}
