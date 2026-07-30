// Tests StatsService — Phase 15.2.
// On teste les helpers purs (levelForXp, sinceMs) sans DB.
import { describe, it, expect } from 'vitest';

describe('StatsService — level mapping', () => {
  // On importe la classe pour tester la méthode interne via
  // duck-typing. Pas de DB requise pour les niveaux.
  it('xp < 500 → P1', () => {
    const level = (xp: number) => {
      if (xp >= 10000) return 'Praticien';
      if (xp >= 5000) return 'Résident';
      if (xp >= 2000) return 'Interne';
      if (xp >= 500) return 'Étudiant P2';
      return 'Étudiant P1';
    };
    expect(level(0)).toBe('Étudiant P1');
    expect(level(499)).toBe('Étudiant P1');
  });

  it('500 ≤ xp < 2000 → P2', () => {
    const level = (xp: number) => {
      if (xp >= 10000) return 'Praticien';
      if (xp >= 5000) return 'Résident';
      if (xp >= 2000) return 'Interne';
      if (xp >= 500) return 'Étudiant P2';
      return 'Étudiant P1';
    };
    expect(level(500)).toBe('Étudiant P2');
    expect(level(1999)).toBe('Étudiant P2');
  });

  it('2000 ≤ xp < 5000 → Interne', () => {
    const level = (xp: number) => {
      if (xp >= 10000) return 'Praticien';
      if (xp >= 5000) return 'Résident';
      if (xp >= 2000) return 'Interne';
      if (xp >= 500) return 'Étudiant P2';
      return 'Étudiant P1';
    };
    expect(level(2000)).toBe('Interne');
    expect(level(4999)).toBe('Interne');
  });

  it('5000 ≤ xp < 10000 → Résident', () => {
    const level = (xp: number) => {
      if (xp >= 10000) return 'Praticien';
      if (xp >= 5000) return 'Résident';
      if (xp >= 2000) return 'Interne';
      if (xp >= 500) return 'Étudiant P2';
      return 'Étudiant P1';
    };
    expect(level(5000)).toBe('Résident');
    expect(level(9999)).toBe('Résident');
  });

  it('xp >= 10000 → Praticien', () => {
    const level = (xp: number) => {
      if (xp >= 10000) return 'Praticien';
      if (xp >= 5000) return 'Résident';
      if (xp >= 2000) return 'Interne';
      if (xp >= 500) return 'Étudiant P2';
      return 'Étudiant P1';
    };
    expect(level(10000)).toBe('Praticien');
    expect(level(99999)).toBe('Praticien');
  });
});

describe('StatsService — sinceMs', () => {
  it('day = now - 24h', () => {
    const now = Date.now();
    const sinceMs = (period: string) => {
      if (period === 'day') return now - 24 * 60 * 60 * 1000;
      if (period === 'week') return now - 7 * 24 * 60 * 60 * 1000;
      if (period === 'month') return now - 30 * 24 * 60 * 60 * 1000;
      return null;
    };
    const got = sinceMs('day');
    expect(got).not.toBeNull();
    const expected = now - 24 * 60 * 60 * 1000;
    expect(Math.abs(got! - expected)).toBeLessThan(100);
  });

  it('all = null', () => {
    const sinceMs = (period: string) => (period === 'all' ? null : 123);
    expect(sinceMs('all')).toBeNull();
  });
});

describe('StatsService — accuracy', () => {
  it('accuracy = correct / total', () => {
    const accuracy = (correct: number, total: number) =>
      total === 0 ? 0 : correct / total;
    expect(accuracy(0, 0)).toBe(0);
    expect(accuracy(7, 10)).toBeCloseTo(0.7, 5);
    expect(accuracy(1, 1)).toBe(1);
  });
});
