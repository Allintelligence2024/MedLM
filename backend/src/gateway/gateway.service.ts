// GatewayService — Phase 20.2 : exécution d'une opération persistée.
//
// Orchestration : match (allow-list) → validation Zod des variables →
// budget de coût (fenêtre glissante, en mémoire d'instance : best
// effort documenté, upgrade Redis Phase 20+ avec le même contract) →
// délégation REST interne (JWT forwardé, aucune élévation) → shaping
// vers la shape GraphQL déclarée.
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  matchPersistedOperation,
  budgetRemaining,
  restQueryFor,
  PersistedOperation,
} from './persisted-operations';
import { REST_BACKEND, RestBackend } from './rest-backend.port';

export type GatewayResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      errors: Array<{ message: string; code: string }>;
      httpStatus: number;
    };

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  /// Budget en mémoire d'instance : userId → historique des coûts.
  /// Best-effort (multi-instance : chaque pod a sa fenêtre — upgrade
  /// Redis documentée, contract inchangé).
  private readonly usage = new Map<string, Array<{ at: number; cost: number }>>();

  constructor(
    @Inject(REST_BACKEND) private readonly backend: RestBackend,
  ) {}

  async execute(args: {
    userId: string;
    jwt: string;
    queryText: string;
    variables?: Record<string, unknown>;
    now?: number;
  }): Promise<GatewayResult> {
    const now = args.now ?? Date.now();

    // 1. Allow-list : pas de requêtes arbitraires.
    const op: PersistedOperation<any> | null = matchPersistedOperation(
      args.queryText,
    );
    if (!op) {
      return {
        ok: false,
        httpStatus: 400,
        errors: [
          {
            message:
              'opération inconnue — le gateway ne sert que des opérations persistées',
            code: 'OPERATION_NOT_PERSISTED',
          },
        ],
      };
    }

    // 2. Variables : Zod strict (rien d'autre ne passe).
    const parsed = op.variables.safeParse(args.variables ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        httpStatus: 400,
        errors: [
          {
            message: 'variables invalides',
            code: 'BAD_VARIABLES',
          },
        ],
      };
    }

    // 3. Budget de coût.
    const entries = this.usage.get(args.userId) ?? [];
    if (budgetRemaining(entries, now) < op.cost) {
      return {
        ok: false,
        httpStatus: 429,
        errors: [
          {
            message: 'budget de coût horaire du gateway épuisé',
            code: 'COST_BUDGET_EXCEEDED',
          },
        ],
      };
    }
    entries.push({ at: now, cost: op.cost });
    this.usage.set(args.userId, entries);

    // 4. Délégation REST interne (JWT forwardé — mêmes permissions).
    const query = restQueryFor(op, parsed.data as Record<string, unknown>);
    const res = await this.backend.get(op.rest.path, {
      jwt: args.jwt,
      query,
    });
    if (res.status >= 400) {
      this.logger.warn(
        `gateway ${op.name}: REST ${op.rest.path} → HTTP ${res.status}`,
      );
      return {
        ok: false,
        httpStatus: res.status === 401 ? 401 : 502,
        errors: [
          {
            message:
              res.status === 401
                ? 'non authentifié'
                : 'service interne indisponible',
            code: res.status === 401 ? 'UNAUTHENTICATED' : 'UPSTREAM_ERROR',
          },
        ],
      };
    }

    // 5. Shaping vers la shape GraphQL documentée.
    return { ok: true, data: op.shape(res.body) };
  }
}
