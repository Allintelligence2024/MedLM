// Tests Phase 20.1 — module regions (pur, sans infra).
import { describe, it, expect } from 'vitest';
import {
  REGIONS,
  DEFAULT_REGION,
  parseRegion,
  mustRegion,
  primaryRegion,
  routingFor,
} from '../../src/common/regions/regions';

describe('REGIONS', () => {
  it('3 régions, toutes en Algérie', () => {
    expect(REGIONS.map((r) => r.id).sort()).toEqual([
      'alger',
      'constantine',
      'oran',
    ]);
    for (const r of REGIONS) {
      expect(r.timezone).toBe('Africa/Algiers');
    }
  });

  it('exactement un primary : alger', () => {
    expect(primaryRegion().id).toBe('alger');
    expect(REGIONS.filter((r) => r.role === 'primary')).toHaveLength(1);
  });

  it('latences cibles positives et primary < répliques', () => {
    for (const r of REGIONS) {
      expect(r.latencyTargetMs).toBeGreaterThan(0);
    }
    const primary = primaryRegion();
    for (const r of REGIONS.filter((x) => x.role === 'replica')) {
      expect(r.latencyTargetMs).toBeGreaterThanOrEqual(primary.latencyTargetMs);
    }
  });
});

describe('parseRegion', () => {
  it('repli documenté sur le primary si absent', () => {
    expect(parseRegion(undefined).id).toBe(DEFAULT_REGION);
    expect(parseRegion('').id).toBe(DEFAULT_REGION);
  });

  it('normalise la casse/espaces', () => {
    expect(parseRegion('  ORAN ').id).toBe('oran');
  });

  it('rejette une région hors DZ (18-07)', () => {
    expect(() => parseRegion('paris')).toThrow(/région inconnue/);
    expect(() => parseRegion('eu-west-1')).toThrow(/région inconnue/);
  });
});

describe('routingFor', () => {
  it('les écritures vont TOUJOURS au primary', () => {
    for (const r of REGIONS) {
      expect(routingFor(r.id).writes).toBe('primary');
    }
  });

  it('les lectures sont locales sur les répliques, primary sinon', () => {
    expect(routingFor('alger').reads).toBe('primary');
    expect(routingFor('oran').reads).toBe('local');
    expect(routingFor('constantine').reads).toBe('local');
  });

  it('mustRegion rejette les identifiants inconnus', () => {
    expect(() => mustRegion('annaba')).toThrow();
    expect(() => routingFor('marseille')).toThrow();
  });
});
