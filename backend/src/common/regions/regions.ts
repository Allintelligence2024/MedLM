// Régions de déploiement — Phase 20.1 (multi-régions DZ).
//
// Trois régions en ALGÉRIE UNIQUEMENT : la loi 18-07 et la promesse
// produit (« les données restent au pays ») interdisent toute région
// hors DZ. Le module est pur (aucune lecture d'env en dehors de
// parseRegion) pour rester testable sans infrastructure.
//
// Topologie :
//   * alger       — PRIMARY (écritures + référence de réplication)
//   * oran        — REPLICA (lectures locales, bascule froide)
//   * constantine — REPLICA (lectures locales, bascule froide)
//
// Règle d'or du routage : les ÉCRITURES vont toujours au primary
// (cohérence forte SRS/fold), les LECTURES se font sur la réplique
// locale quand il y en a une (latence P95 < 500 ms partout).

export type RegionRole = 'primary' | 'replica';

export interface RegionDef {
  id: string;
  role: RegionRole;
  /// Fuseau IANA (toutes les régions sont DZ — Africa/Algiers).
  timezone: string;
  /// Objectif de latence locale documenté (ms, P95).
  latencyTargetMs: number;
  /// Ville (affichage ops uniquement).
  cityFr: string;
}

export const REGIONS: readonly RegionDef[] = Object.freeze([
  {
    id: 'alger',
    role: 'primary',
    timezone: 'Africa/Algiers',
    latencyTargetMs: 120,
    cityFr: 'Alger',
  },
  {
    id: 'oran',
    role: 'replica',
    timezone: 'Africa/Algiers',
    latencyTargetMs: 250,
    cityFr: 'Oran',
  },
  {
    id: 'constantine',
    role: 'replica',
    timezone: 'Africa/Algiers',
    latencyTargetMs: 250,
    cityFr: 'Constantine',
  },
] as const);

export const DEFAULT_REGION = 'alger';

export interface RegionRouting {
  region: string;
  role: RegionRole;
  /// Toujours 'primary' — jamais d'écriture sur une réplique.
  writes: 'primary';
  /// 'local' si la région a une réplique, 'primary' sinon.
  reads: 'local' | 'primary';
}

/// Valide une région depuis l'env ; repli documenté sur le primary.
export function parseRegion(raw: string | undefined): RegionDef {
  if (!raw) return mustRegion(DEFAULT_REGION);
  const normalized = raw.trim().toLowerCase();
  const found = REGIONS.find((r) => r.id === normalized);
  if (!found) {
    throw new Error(
      `région inconnue '${raw}' (attendu : ${REGIONS.map((r) => r.id).join(', ')})`,
    );
  }
  return found;
}

export function mustRegion(id: string): RegionDef {
  const found = REGIONS.find((r) => r.id === id);
  if (!found) throw new Error(`région inconnue '${id}'`);
  return found;
}

/// Un seul primary, invariant structurel (vérifié aussi par test).
export function primaryRegion(): RegionDef {
  const primaries = REGIONS.filter((r) => r.role === 'primary');
  if (primaries.length !== 1) {
    throw new Error(`exactement 1 primary attendu, trouvé ${primaries.length}`);
  }
  return primaries[0]!;
}

/// Routage lecture/écriture pour une région donnée.
export function routingFor(regionId: string): RegionRouting {
  const region = mustRegion(regionId);
  return {
    region: region.id,
    role: region.role,
    writes: 'primary',
    reads: region.role === 'replica' ? 'local' : 'primary',
  };
}

/// Nom de la variable d'env qui porte la région (jamais de valeur
/// secrète ici — juste un identifiant de site).
export const REGION_ENV_VAR = 'MEDANKI_REGION';
