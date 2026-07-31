// Tests Phase 18.5 — Détection de décrochage (logique pure, sans DB).
import { describe, it, expect } from 'vitest';
import {
  RetentionService,
  RETENTION_THRESHOLDS,
} from '../../src/ai/retention/retention.service';
import { buildRetentionMessage } from '../../src/ai/retention/retention.messages';
import { FSRS_MILLIS_PER_DAY } from '../../src/common/fsrs/fsrs.constants';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * FSRS_MILLIS_PER_DAY);

// ── classifyInactivity — bornes exactes ─────────────────────────────
describe('RetentionService.classifyInactivity', () => {
  it.each([
    [0, 'none'],
    [RETENTION_THRESHOLDS.GENTLE_MIN_DAYS - 1, 'none'],
    [RETENTION_THRESHOLDS.GENTLE_MIN_DAYS, 'gentle'],
    [RETENTION_THRESHOLDS.STREAK_BROKEN_MIN_DAYS - 1, 'gentle'],
    [RETENTION_THRESHOLDS.STREAK_BROKEN_MIN_DAYS, 'streak_broken'],
    [RETENTION_THRESHOLDS.REENGAGEMENT_MIN_DAYS - 1, 'streak_broken'],
    [RETENTION_THRESHOLDS.REENGAGEMENT_MIN_DAYS, 'reengagement'],
    [45, 'reengagement'],
  ])('inactiveDays=%i → %s', (days, expected) => {
    expect(RetentionService.classifyInactivity(days)).toBe(expected);
  });
});

describe('RetentionService.levelScore', () => {
  it('ordre strict none < gentle < streak_broken < reengagement', () => {
    expect(RetentionService.levelScore('none')).toBeLessThan(
      RetentionService.levelScore('gentle'),
    );
    expect(RetentionService.levelScore('gentle')).toBeLessThan(
      RetentionService.levelScore('streak_broken'),
    );
    expect(RetentionService.levelScore('streak_broken')).toBeLessThan(
      RetentionService.levelScore('reengagement'),
    );
  });
});

// ── shouldNotify — anti-spam ────────────────────────────────────────
describe('RetentionService.shouldNotify', () => {
  it('level none → jamais', () => {
    expect(
      RetentionService.shouldNotify({ level: 'none', lastAlert: null, now: NOW }),
    ).toBe(false);
  });

  it('première alerte → oui', () => {
    expect(
      RetentionService.shouldNotify({ level: 'gentle', lastAlert: null, now: NOW }),
    ).toBe(true);
  });

  it('même niveau il y a 2 jours → non', () => {
    expect(
      RetentionService.shouldNotify({
        level: 'gentle',
        lastAlert: { level: 'gentle', notifiedAt: daysAgo(2) },
        now: NOW,
      }),
    ).toBe(false);
  });

  it('même niveau il y a 8 jours → oui (cooldown 7 j)', () => {
    expect(
      RetentionService.shouldNotify({
        level: 'gentle',
        lastAlert: { level: 'gentle', notifiedAt: daysAgo(8) },
        now: NOW,
      }),
    ).toBe(true);
  });

  it('escalade après 3 jours → oui', () => {
    expect(
      RetentionService.shouldNotify({
        level: 'streak_broken',
        lastAlert: { level: 'gentle', notifiedAt: daysAgo(4) },
        now: NOW,
      }),
    ).toBe(true);
  });

  it('escalade trop tôt (1 jour) → non', () => {
    expect(
      RetentionService.shouldNotify({
        level: 'streak_broken',
        lastAlert: { level: 'gentle', notifiedAt: daysAgo(1) },
        now: NOW,
      }),
    ).toBe(false);
  });

  it('désescalade (reengagement → gentle) pendant le cooldown → non', () => {
    expect(
      RetentionService.shouldNotify({
        level: 'gentle',
        lastAlert: { level: 'reengagement', notifiedAt: daysAgo(5) },
        now: NOW,
      }),
    ).toBe(false);
  });
});

// ── Messages trilingues ─────────────────────────────────────────────
describe('buildRetentionMessage', () => {
  it('gentle interpole les jours en fr', () => {
    const m = buildRetentionMessage('gentle', 'fr', { days: 4 });
    expect(m.title.length).toBeGreaterThan(0);
    expect(m.body).toContain('4 jours');
  });

  it('streak_broken mentionne le streak perdu quand il est connu', () => {
    const m = buildRetentionMessage('streak_broken', 'fr', {
      days: 6,
      streakDays: 12,
    });
    expect(m.body).toContain('6 jours');
    expect(m.body).toContain('12');
  });

  it('streak_broken sans streak connu → pas de mention', () => {
    const m = buildRetentionMessage('streak_broken', 'fr', { days: 6 });
    expect(m.body).not.toContain('perdu');
    expect(m.body).toContain('6 jours');
  });

  it('toutes les combinaisons niveau × langue sont non vides (sauf none)', () => {
    for (const level of ['gentle', 'streak_broken', 'reengagement'] as const) {
      for (const lang of ['fr', 'ar', 'en'] as const) {
        const m = buildRetentionMessage(level, lang, { days: 7 });
        expect(m.title.length, `${level}/${lang} title`).toBeGreaterThan(0);
        expect(m.body, `${level}/${lang} body`).toContain('7');
      }
    }
  });

  it('reengagement en arabe reste en arabe', () => {
    const m = buildRetentionMessage('reengagement', 'ar', { days: 12 });
    expect(m.body).toContain('12');
    expect(m.title).toMatch(/[\u0600-\u06FF]/);
  });
});
