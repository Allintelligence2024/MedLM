// Gateway GraphQL v2 — opérations persistées (Phase 20.2).
//
// Choix d'architecture (imposé par la menace GraphQL classique :
// injections de requêtes arbitraires, n+1, abus de coût) :
//
//   LE GATEWAY N'ACCEPTE AUCUNE REQUÊTE ARBITRAIRE.
//   Il sert une ALLOW-LIST d'opérations nommées, déclarées ici avec
//   leur schéma de variables Zod, leur coût et leur délégation REST
//   interne. Toute requête dont le texte normalisé n'est pas dans la
//   liste est rejetée (400) — c'est le modèle « persisted operations /
//   trusted documents », plus strict qu'un simple cost-limit.
//
// Pur et testable : aucune I/O dans ce fichier.
import { z } from 'zod';

// ── Normalisation du texte de requête ────────────────────────────────────

/// Supprime les commentaires (#...), collapse les espaces ET
/// canonise l'espacement autour des délimiteurs {}() : deux textes
/// sémantiquement identiques (« pretty-printed » ou minifié) doivent
/// produire la même empreinte. Les clients envoient le texte canonique
/// (cf. README) — cette normalisation tolère la mise en page.
///
/// NB : l'ancienne version splittait le littéral « backslash-n » au
/// lieu des vrais sauts de ligne et ses regex avaient des backslashes
/// doublés — les deux sont corrigés ici.
export function normalizeOperationText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}()])\s*/g, '$1')
    .trim();
}

// ── Déclaration d'une opération persistée ────────────────────────────────

export interface PersistedOperation<TVars = unknown> {
  name: string;
  /// Texte GraphQL exact (sera normalisé pour l'empreinte).
  sdl: string;
  /// Coût débité du budget horaire de l'utilisateur.
  cost: number;
  /// Schéma Zod STRICT des variables (rien d'autre ne passe).
  variables: z.ZodType<TVars>;
  /// Délégation REST interne (chemin sous /v1, query autorisée).
  rest: {
    method: 'GET';
    path: string;
    /// Clés de variables transférables en query string (allow-list).
    queryKeys: readonly string[];
  };
  /// Projection du JSON REST vers la shape GraphQL documentée.
  shape: (restPayload: unknown) => unknown;
}

// ── Budget de coût (pur) ─────────────────────────────────────────────────

export const GATEWAY_COST_BUDGET_PER_HOUR = 500;
export const GATEWAY_WINDOW_MS = 3_600_000;

/// Fenêtre glissante : somme des coûts dans la dernière heure.
export function budgetUsed(
  entries: Array<{ at: number; cost: number }>,
  now: number,
): number {
  const since = now - GATEWAY_WINDOW_MS;
  return entries.filter((e) => e.at >= since).reduce((s, e) => s + e.cost, 0);
}

export function budgetRemaining(
  entries: Array<{ at: number; cost: number }>,
  now: number,
): number {
  return Math.max(0, GATEWAY_COST_BUDGET_PER_HOUR - budgetUsed(entries, now));
}

// ── Allow-list des opérations v2 (lecture seule — pas de mutation) ───────

const emptyVars = z.object({}).strict();

export const PERSISTED_OPERATIONS: readonly PersistedOperation<any>[] = [
  {
    name: 'ViewerStats',
    sdl: 'query ViewerStats($period: StatsPeriod) { viewerStats(period: $period) { period cardsReviewed accuracy currentStreak xpTotal level leechCount } }',
    cost: 10,
    variables: z
      .object({
        period: z.enum(['day', 'week', 'month', 'all']).default('all'),
      })
      .strict(),
    rest: {
      method: 'GET',
      path: '/stats/me',
      queryKeys: ['period'],
    },
    shape: (p: any) => ({
      viewerStats: {
        period: p.period,
        cardsReviewed: p.cards_reviewed,
        accuracy: p.accuracy,
        currentStreak: p.current_streak,
        xpTotal: p.xp_total,
        level: p.level,
        leechCount: p.leech_count,
      },
    }),
  },
  {
    name: 'DeckCatalog',
    sdl: 'query DeckCatalog { deckCatalog { deckId nameFr isPremium updatedAt } }',
    cost: 5,
    variables: emptyVars,
    rest: { method: 'GET', path: '/content/decks', queryKeys: [] },
    shape: (p: any) => ({
      deckCatalog: (p.items ?? p ?? []).map((d: any) => ({
        deckId: d.deck_id,
        nameFr: d.name_fr,
        isPremium: d.is_premium,
        updatedAt: d.updated_at,
      })),
    }),
  },
  {
    name: 'AdaptiveProfile',
    sdl: 'query AdaptiveProfile { adaptiveProfile { windowDays totalReviews lapseRate fsrsAdjustment { active changedIndices reasons } } }',
    cost: 15,
    variables: emptyVars,
    rest: { method: 'GET', path: '/ai/adaptive/profile', queryKeys: [] },
    shape: (p: any) => ({
      adaptiveProfile: {
        windowDays: p.window_days,
        totalReviews: p.total_reviews,
        lapseRate: p.lapse_rate,
        fsrsAdjustment: {
          active: p.fsrs_adjustment?.active ?? false,
          changedIndices: p.fsrs_adjustment?.changed_indices ?? [],
          reasons: p.fsrs_adjustment?.reasons ?? [],
        },
      },
    }),
  },
  {
    name: 'MockExamTemplates',
    sdl: 'query MockExamTemplates($faculty: String, $studyYear: Int) { mockExamTemplates(faculty: $faculty, studyYear: $studyYear) { id title } }',
    cost: 8,
    variables: z
      .object({
        faculty: z.string().min(1).max(120).optional(),
        studyYear: z.number().int().min(1).max(7).optional(),
      })
      .strict(),
    rest: {
      method: 'GET',
      path: '/exams/templates',
      queryKeys: ['faculty', 'study_year'],
    },
    shape: (p: any) => ({
      mockExamTemplates: (Array.isArray(p) ? p : []).map((t: any) => ({
        id: t.id,
        title: t.title ?? t.name ?? '',
      })),
    }),
  },
  {
    name: 'LeaderboardTop',
    sdl: 'query LeaderboardTop($faculty: String, $studyYear: Int, $limit: Int) { leaderboardTop(faculty: $faculty, studyYear: $studyYear, limit: $limit) { entries { pseudonym xpTotal rank } week } }',
    cost: 6,
    variables: z
      .object({
        faculty: z.string().min(1).max(120).optional(),
        studyYear: z.number().int().min(1).max(7).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .strict(),
    rest: {
      method: 'GET',
      path: '/gamification/leaderboard',
      queryKeys: ['faculty', 'study_year', 'limit'],
    },
    shape: (p: any) => ({
      leaderboardTop: {
        week: p.week ?? null,
        entries: (p.entries ?? []).map((e: any) => ({
          pseudonym: e.pseudonym,
          xpTotal: e.xp_total,
          rank: e.rank,
        })),
      },
    }),
  },
] as const;

// ── Résolution par empreinte normalisée ─────────────────────────────────

const FINGERPRINTS: ReadonlyMap<string, PersistedOperation<any>> = new Map(
  PERSISTED_OPERATIONS.map((op) => [normalizeOperationText(op.sdl), op]),
);

export const PERSISTED_NAMES: readonly string[] = PERSISTED_OPERATIONS.map(
  (op) => op.name,
);

/// Retrouve l'opération persistée correspondant AU TEXTE EXACT du
/// client (normalisé). null → rejet (pas de requêtes arbitraires).
export function matchPersistedOperation(
  queryText: string,
): PersistedOperation<any> | null {
  const key = normalizeOperationText(queryText);
  if (key.length === 0 || key.length > 4_000) return null;
  return FINGERPRINTS.get(key) ?? null;
}

/// Query string REST interne : seules les clés allow-listées passent,
/// avec le mapping camelCase→snake_case documenté.
const KEY_MAP: Record<string, string> = { studyYear: 'study_year' };

export function restQueryFor(
  op: PersistedOperation<any>,
  vars: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of op.rest.queryKeys) {
    const clientKey =
      Object.entries(KEY_MAP).find(([, snake]) => snake === key)?.[0] ?? key;
    const value = vars[clientKey] ?? vars[key];
    if (value !== undefined && value !== null && value !== '') {
      out[key] = String(value);
    }
  }
  return out;
}
