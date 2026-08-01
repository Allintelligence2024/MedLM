/// Jeton d'injection du store de budget (audit P2-2).
///
/// Fichier séparé pour éviter un cycle d'imports : `gateway.service.ts`
/// n'a besoin que du contrat, pas des implémentations.
export { type CostBudgetStore } from './cost-budget.store';

export const COST_BUDGET_STORE = Symbol('COST_BUDGET_STORE');
