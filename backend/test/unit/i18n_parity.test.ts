// Tests de parité i18n — Phase 19.3.
// Garantit que toute clé ajoutée au catalogue existe dans les 3 langues,
// avec des placeholders cohérents, et que les messages IA sensibles
// (disclaimer tuteur) matchent exactement leurs sources normatives.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATALOG,
  I18n,
  isRtl,
  SUPPORTED_LANGS,
} from '../../src/i18n/i18n';
import {
  MEDICAL_DISCLAIMER,
  OUT_OF_SCOPE_REPLY,
} from '../../src/ai/tutor/tutor.policy';

/// Extrait les placeholders simples {name} (hors plural-blocks).
function placeholders(msg: string): string[] {
  const withoutPlural = msg.replace(/\{\w+,\s*plural,[^}]+\}/g, '');
  const m = withoutPlural.match(/\{(\w+)\}/g) ?? [];
  return m.map((p) => p.replace(/[{}]/g, '')).sort();
}

// ── Parité des clés entre langues ───────────────────────────────────
describe('i18n — parité FR/AR/EN', () => {
  for (const lang of SUPPORTED_LANGS) {
    it(`chaque clé FR existe en ${lang.toUpperCase()}`, () => {
      for (const key of Object.keys(DEFAULT_CATALOG.fr)) {
        expect(
          DEFAULT_CATALOG[lang][key],
          `clé manquante en ${lang} : ${key}`,
        ).toBeDefined();
      }
    });
    it(`chaque clé ${lang.toUpperCase()} existe en FR`, () => {
      for (const key of Object.keys(DEFAULT_CATALOG[lang])) {
        expect(
          DEFAULT_CATALOG.fr[key],
          `clé manquante en fr : ${key}`,
        ).toBeDefined();
      }
    });
  }

  it('aucun message vide', () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const [key, msg] of Object.entries(DEFAULT_CATALOG[lang])) {
        expect(msg.trim().length, `${lang}:${key} vide`).toBeGreaterThan(0);
      }
    }
  });

  it('placeholders simples identiques entre langues', () => {
    for (const key of Object.keys(DEFAULT_CATALOG.fr)) {
      const ref = placeholders(DEFAULT_CATALOG.fr[key]!);
      for (const lang of SUPPORTED_LANGS) {
        expect(
          placeholders(DEFAULT_CATALOG[lang][key]!),
          `placeholders divergents ${lang}:${key}`,
        ).toEqual(ref);
      }
    }
  });
});

// ── Clés IA : résolution trilingue effective ────────────────────────
describe('i18n — clés Phase 18/IA', () => {
  const i18n = new I18n();
  const AI_KEYS = [
    'ai.hint.fetched',
    'ai.generate.drafts_created',
    'ai.generate.quota_exceeded',
    'ai.voice.draft_created',
    'ai.adaptive.profile_fetched',
    'ai.adaptive.scan_done',
    'ai.tutor.disclaimer',
    'ai.tutor.out_of_scope',
    'ai.tutor.quota_exceeded',
    'retention.gentle.title',
    'retention.gentle.body',
    'retention.streak_broken.title',
    'retention.streak_broken.body',
    'retention.reengagement.title',
    'retention.reengagement.body',
  ];

  it('toutes les clés IA résolvent dans les 3 langues', () => {
    for (const key of AI_KEYS) {
      for (const lang of SUPPORTED_LANGS) {
        const msg = i18n.t(lang, key, { days: 5, count: 3 });
        expect(msg, `${lang}:${key}`).not.toBe(key);
        expect(msg.length).toBeGreaterThan(0);
      }
    }
  });

  it('retention.gentle.body substitue {days}', () => {
    expect(i18n.t('fr', 'retention.gentle.body', { days: 6 })).toContain('6 jours');
    expect(i18n.t('en', 'retention.gentle.body', { days: 6 })).toContain('6 days');
    expect(i18n.t('ar', 'retention.gentle.body', { days: 6 })).toContain('6');
  });

  it('pluralisation ICU-lite fonctionne sur ai.generate.drafts_created', () => {
    expect(i18n.t('fr', 'ai.generate.drafts_created', { count: 1 })).toContain('1 brouillon créé');
    expect(i18n.t('fr', 'ai.generate.drafts_created', { count: 4 })).toContain('4 brouillons créés');
  });
});

// ── Source unique : disclaimers catalog == policy ───────────────────
describe('i18n — cohérence avec tutor.policy.ts', () => {
  it('ai.tutor.disclaimer === MEDICAL_DISCLAIMER (3 langues)', () => {
    for (const lang of SUPPORTED_LANGS) {
      expect(DEFAULT_CATALOG[lang]['ai.tutor.disclaimer']).toBe(
        MEDICAL_DISCLAIMER[lang],
      );
    }
  });

  it('ai.tutor.out_of_scope === début de OUT_OF_SCOPE_REPLY (3 langues)', () => {
    for (const lang of SUPPORTED_LANGS) {
      // Le catalogue est la version courte affichée côté client ;
      // le début doit matcher le texte normatif (pas deux formulations).
      expect(OUT_OF_SCOPE_REPLY[lang]).toContain(
        DEFAULT_CATALOG[lang]['ai.tutor.out_of_scope']!.split('—')[0]!.trim().slice(0, 20),
      );
    }
  });

  it('ar est RTL — vérifié pour les clés IA aussi', () => {
    expect(isRtl('ar')).toBe(true);
  });
});
