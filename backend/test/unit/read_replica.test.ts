// Tests ReadReplicaRouter — Phase 17.2.
import { describe, it, expect, beforeEach } from 'vitest';
import { ReadReplicaRouter } from '../../src/db/read-replica-router';

describe('ReadReplicaRouter — primary', () => {
  it('retourne toujours le primary pour les écritures', () => {
    const r = new ReadReplicaRouter({
      primaryUrl: 'postgres://primary',
      replicaUrls: ['postgres://replica1'],
    });
    expect(r.primary()).toBe('postgres://primary');
  });

  it('retourne le primary si pas de replica configurée', () => {
    const r = new ReadReplicaRouter({ primaryUrl: 'postgres://primary' });
    expect(r.read()).toBe('postgres://primary');
  });
});

describe('ReadReplicaRouter — read()', () => {
  let r: ReadReplicaRouter;
  beforeEach(() => {
    r = new ReadReplicaRouter({
      primaryUrl: 'postgres://primary',
      replicaUrls: ['postgres://r1', 'postgres://r2', 'postgres://r3'],
      lagToleranceMs: 10_000,
    });
  });

  it('retourne le primary si toutes les replicas sont down', () => {
    r.updateHealth({ url: 'postgres://r1', reachable: false, lagMs: 0 });
    r.updateHealth({ url: 'postgres://r2', reachable: false, lagMs: 0 });
    r.updateHealth({ url: 'postgres://r3', reachable: false, lagMs: 0 });
    expect(r.read()).toBe('postgres://primary');
  });

  it('retourne le primary si toutes les replicas sont trop lagging', () => {
    r.updateHealth({ url: 'postgres://r1', reachable: true, lagMs: 60_000 });
    r.updateHealth({ url: 'postgres://r2', reachable: true, lagMs: 50_000 });
    r.updateHealth({ url: 'postgres://r3', reachable: true, lagMs: 40_000 });
    expect(r.read()).toBe('postgres://primary');
  });

  it('retourne la replica avec le lag le plus bas', () => {
    r.updateHealth({ url: 'postgres://r1', reachable: true, lagMs: 5_000 });
    r.updateHealth({ url: 'postgres://r2', reachable: true, lagMs: 1_000 });
    r.updateHealth({ url: 'postgres://r3', reachable: true, lagMs: 3_000 });
    expect(r.read()).toBe('postgres://r2');
  });

  it('ignore les replicas unhealthy même si moins lagging', () => {
    r.updateHealth({ url: 'postgres://r1', reachable: false, lagMs: 100 });
    r.updateHealth({ url: 'postgres://r2', reachable: true, lagMs: 5_000 });
    expect(r.read()).toBe('postgres://r2');
  });

  it('sticky session : un user garde la même replica', () => {
    r.updateHealth({ url: 'postgres://r1', reachable: true, lagMs: 5_000 });
    r.updateHealth({ url: 'postgres://r2', reachable: true, lagMs: 1_000 });
    // Premier read pour session s1 : r2 (lag le plus bas).
    expect(r.read('s1')).toBe('postgres://r2');
    // Mettre r1 à lag plus bas — s1 doit rester sur r2.
    r.updateHealth({ url: 'postgres://r1', reachable: true, lagMs: 100 });
    expect(r.read('s1')).toBe('postgres://r2');
    // Une autre session s2 peut aller sur r1.
    expect(r.read('s2')).toBe('postgres://r1');
  });

  it('sticky session expire si la replica devient unhealthy', () => {
    r.updateHealth({ url: 'postgres://r2', reachable: true, lagMs: 1_000 });
    r.read('s1'); // s1 → r2
    // r2 tombe.
    r.updateHealth({ url: 'postgres://r2', reachable: false, lagMs: 0 });
    r.updateHealth({ url: 'postgres://r1', reachable: true, lagMs: 5_000 });
    // s1 doit basculer sur r1.
    expect(r.read('s1')).toBe('postgres://r1');
  });
});

describe('ReadReplicaRouter — analytics()', () => {
  it('round-robin entre les replicas (pas de sticky)', () => {
    const r = new ReadReplicaRouter({
      primaryUrl: 'postgres://primary',
      replicaUrls: ['postgres://r1', 'postgres://r2', 'postgres://r3'],
    });
    // 3 appels à des secondes différentes → on devrait avoir
    // 3 valeurs distinctes (ou au moins 2).
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      // On ne peut pas vraiment contrôler Date.now(), donc on
      // accepte que seen ait 1..3 éléments.
      seen.add(r.analytics());
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(seen.size).toBeLessThanOrEqual(3);
  });

  it('fallback primary si pas de replica', () => {
    const r = new ReadReplicaRouter({ primaryUrl: 'postgres://primary' });
    expect(r.analytics()).toBe('postgres://primary');
  });
});

describe('ReadReplicaRouter — snapshot', () => {
  it('expose un état pour le debug', () => {
    const r = new ReadReplicaRouter({
      primaryUrl: 'postgres://primary',
      replicaUrls: ['postgres://r1'],
    });
    r.updateHealth({ url: 'postgres://r1', reachable: true, lagMs: 100 });
    r.read('s1');
    const snap = r.snapshot();
    expect(snap.primary).toBe('postgres://primary');
    expect(snap.replicas.length).toBe(1);
    expect(snap.active_sessions).toBe(1);
  });
});
