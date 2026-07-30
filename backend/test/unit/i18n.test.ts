// Tests i18n — Phase 17.5.
import { describe, it, expect } from 'vitest';
import { I18n, isRtl, isSupported, DEFAULT_LANG, SUPPORTED_LANGS } from '../../src/i18n/i18n';

describe('i18n — isSupported / isRtl', () => {
  it('supporte fr, ar, en', () => {
    expect(SUPPORTED_LANGS).toEqual(['fr', 'ar', 'en']);
    expect(DEFAULT_LANG).toBe('fr');
    expect(isSupported('fr')).toBe(true);
    expect(isSupported('ar')).toBe(true);
    expect(isSupported('en')).toBe(true);
    expect(isSupported('es')).toBe(false);
  });

  it('ar est RTL', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('fr')).toBe(false);
    expect(isRtl('en')).toBe(false);
  });
});

describe('I18n.t — résolution simple', () => {
  const i18n = new I18n();

  it('résout une clé en FR', () => {
    expect(i18n.t('fr', 'error.not_found')).toBe('Ressource introuvable');
  });

  it('résout une clé en AR', () => {
    expect(i18n.t('ar', 'error.not_found')).toBe('المورد غير موجود');
  });

  it('résout une clé en EN', () => {
    expect(i18n.t('en', 'error.not_found')).toBe('Resource not found');
  });

  it('fallback sur FR si la clé manque en AR', () => {
    // On crée un i18n sans la clé 'share.created' en AR.
    const customI18n = new I18n({
      fr: { 'custom.key': 'Bonjour' },
      ar: {},
      en: { 'custom.key': 'Hello' },
    });
    expect(customI18n.t('ar', 'custom.key')).toBe('Bonjour');
  });

  it('retourne la clé si elle n\'existe nulle part', () => {
    expect(i18n.t('fr', 'unknown.key.xyz')).toBe('unknown.key.xyz');
  });
});

describe('I18n.t — substitution de paramètres', () => {
  const i18n = new I18n();

  it('substitue {name}', () => {
    expect(i18n.t('fr', 'gamification.level.up', { level: 'Interne' })).toBe(
      'Vous êtes passé au niveau Interne !',
    );
  });

  it('substitue {duration} et {score}', () => {
    expect(i18n.t('fr', 'exam.start.success', { duration: 30 })).toContain('30');
    expect(i18n.t('fr', 'exam.submit.success', { score: 85 })).toContain('85');
  });

  it('préserve les placeholders inconnus', () => {
    const r = i18n.t('fr', 'gamification.level.up', {});
    expect(r).toContain('{level}');
  });
});

describe('I18n.t — pluralisation ICU-lite', () => {
  const i18n = new I18n({
    fr: {
      'test.cards': '{count, plural, one {# carte} other {# cartes}}',
    },
    ar: {},
    en: {
      'test.cards': '{count, plural, one {# card} other {# cards}}',
    },
  });

  it('singulier en FR', () => {
    expect(i18n.t('fr', 'test.cards', { count: 1 })).toBe('1 carte');
  });

  it('pluriel en FR', () => {
    expect(i18n.t('fr', 'test.cards', { count: 5 })).toBe('5 cartes');
  });

  it('zéro = "other" en FR', () => {
    expect(i18n.t('fr', 'test.cards', { count: 0 })).toBe('0 cartes');
  });

  it('singulier en EN', () => {
    expect(i18n.t('en', 'test.cards', { count: 1 })).toBe('1 card');
  });
});

describe('I18n.set — modification dynamique', () => {
  it('ajoute une clé dynamiquement', () => {
    const i18n = new I18n({ fr: {}, ar: {}, en: {} });
    i18n.set('fr', 'new.key', 'Nouvelle valeur');
    expect(i18n.t('fr', 'new.key')).toBe('Nouvelle valeur');
  });
});
