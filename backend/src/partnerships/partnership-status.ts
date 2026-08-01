// Machine à états des partenariats — Phase 20.4 (pure, testée).
//
//   draft ──► active ◄──► suspended
//     │         │            │
//     └────► terminated ◄────┘
//
// terminated est PUIT : un partenariat terminé ne ressuscite pas —
// nouvelle négociation = nouvelle ligne (audit propre).

export type PartnershipStatus =
  | 'draft'
  | 'active'
  | 'suspended'
  | 'terminated';

const TRANSITIONS: Readonly<
  Record<PartnershipStatus, readonly PartnershipStatus[]>
> = {
  draft: ['active', 'terminated'],
  active: ['suspended', 'terminated'],
  suspended: ['active', 'terminated'],
  terminated: [],
} as const;

export const PARTNERSHIP_STATUSES: readonly PartnershipStatus[] =
  Object.freeze(['draft', 'active', 'suspended', 'terminated'] as const);

export function canTransition(
  from: PartnershipStatus,
  to: PartnershipStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/// Lance une erreur explicite si la transition est interdite.
export function assertTransition(
  from: PartnershipStatus,
  to: PartnershipStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `transition partenariat interdite : ${from} → ${to} ` +
        `(autorisées depuis ${from} : ${TRANSITIONS[from].join(', ') || 'aucune'})`,
    );
  }
}

/// Active exige une signature : garde-fou métier pur.
export function assertActivable(args: {
  from: PartnershipStatus;
  signedAt: Date | null;
  commissionPct: number;
}): void {
  assertTransition(args.from, 'active');
  if (args.from === 'draft' && args.signedAt == null) {
    throw new Error(
      'activation impossible : date de signature manquante (draft → active)',
    );
  }
  if (args.commissionPct < 0 || args.commissionPct > 50) {
    throw new Error(`commission hors bornes 0..50 : ${args.commissionPct}`);
  }
}
