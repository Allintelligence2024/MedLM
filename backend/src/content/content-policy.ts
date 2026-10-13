/// Politique d'accès au contenu et de workflow éditorial (phase 2).
///
/// Matrice :
///   student           — cartes publiées ; premium seulement si entitlement actif
///   author            — + ses propres brouillons / relectures
///   medical_reviewer  — + relecture et approbation (pas les siens)
///   editor            — + publication et retrait (pas les siens)
///   admin             — tout, y compris une dérogation d'auto-approbation AUDITÉE
///
/// Les lectures apprenant et les lectures CMS sont des décisions distinctes :
/// un étudiant ne doit jamais apprendre l'existence d'un brouillon (404, pas 403).
import { PERM, type Role, roleHas } from "../rbac/roles";

export type ContentActor = {
  userId: string;
  role: Role;
};

export type CardAccessView = {
  status: string;
  isPremium: boolean;
  createdBy: string | null;
  deckIsPremium: boolean;
};

export type AccessDecision = "allow" | "not_found" | "forbidden";

export const WORKFLOW_GRAPH: Record<string, readonly string[]> = {
  draft: ["review", "retired"],
  review: ["approved", "draft", "retired"],
  approved: ["published", "review", "retired"],
  published: ["retired"],
  retired: ["draft"],
};

export type TransitionFailure =
  | "illegal_transition"
  | "insufficient_role"
  | "self_approval"
  | "override_forbidden";

export type TransitionDecision =
  | { ok: true; requiresOverride: boolean }
  | { ok: false; reason: TransitionFailure };

export function actorOf(userId: string, role: Role | undefined): ContentActor {
  return { userId, role: role ?? "student" };
}

export function isStaff(role: Role): boolean {
  return role !== "student";
}

/// Lecture d'une carte : 404 pour masquer les brouillons aux non-ayants-droit.
export function decideCardRead(
  actor: ContentActor,
  card: CardAccessView,
  entitled: boolean,
): AccessDecision {
  if (card.status !== "published") {
    if (actor.role === "student") return "not_found";
    if (actor.role === "author") {
      return card.createdBy === actor.userId ? "allow" : "not_found";
    }
    return "allow";
  }
  const premium = card.isPremium || card.deckIsPremium;
  if (premium && actor.role === "student" && !entitled) return "forbidden";
  return "allow";
}

/// Liste apprenant d'un deck : uniquement du publié. Le catalogue peut
/// mentionner un deck premium ; le contenu des cartes exige l'entitlement.
export function decideLearnerDeckRead(
  actor: ContentActor,
  deck: { publishedAt: Date | null; isPremium: boolean },
  entitled: boolean,
): AccessDecision {
  if (!deck.publishedAt) return "not_found";
  if (deck.isPremium && actor.role === "student" && !entitled)
    return "forbidden";
  return "allow";
}

export function cmsListScope(actor: ContentActor): "own" | "all" | "none" {
  if (actor.role === "student") return "none";
  if (actor.role === "author") return "own";
  return "all";
}

export function decideCardEdit(
  actor: ContentActor,
  card: { status: string; createdBy: string | null },
): AccessDecision {
  if (actor.role === "student") return "forbidden";
  if (actor.role === "author" || actor.role === "medical_reviewer") {
    if (card.createdBy !== actor.userId) return "not_found";
    if (card.status === "draft" || card.status === "review") return "allow";
    return "forbidden";
  }
  return "allow";
}

function roleMayTransition(
  role: Role,
  from: string,
  to: string,
  isOwner: boolean,
): boolean {
  const key = `${from}->${to}`;
  switch (key) {
    case "draft->review":
      return (
        (isOwner && roleHas(role, PERM.CREATE_DRAFT_CARD)) ||
        roleHas(role, PERM.MANAGE_DECKS)
      );
    case "draft->retired":
      return (
        (isOwner && roleHas(role, PERM.CREATE_DRAFT_CARD)) ||
        roleHas(role, PERM.RETIRE_CARD)
      );
    case "review->approved":
      return roleHas(role, PERM.APPROVE_CARD);
    case "review->draft":
      return isOwner || roleHas(role, PERM.REJECT_CARD);
    case "review->retired":
      return roleHas(role, PERM.RETIRE_CARD);
    case "approved->published":
      return roleHas(role, PERM.PUBLISH_CARD);
    case "approved->review":
      return roleHas(role, PERM.REVIEW_CARD);
    case "approved->retired":
    case "published->retired":
      return roleHas(role, PERM.RETIRE_CARD);
    case "retired->draft":
      return roleHas(role, PERM.MANAGE_DECKS);
    default:
      return false;
  }
}

export function decideTransition(args: {
  from: string;
  to: string;
  actor: ContentActor;
  ownerId: string | null;
  adminOverride: boolean;
}): TransitionDecision {
  const allowed = WORKFLOW_GRAPH[args.from] ?? [];
  if (!allowed.includes(args.to))
    return { ok: false, reason: "illegal_transition" };
  if (args.adminOverride && args.actor.role !== "admin") {
    return { ok: false, reason: "override_forbidden" };
  }
  const isOwner = args.ownerId !== null && args.ownerId === args.actor.userId;
  if (!roleMayTransition(args.actor.role, args.from, args.to, isOwner)) {
    return { ok: false, reason: "insufficient_role" };
  }
  const selfGate =
    isOwner && (args.to === "approved" || args.to === "published");
  if (selfGate && !args.adminOverride) {
    return { ok: false, reason: "self_approval" };
  }
  return {
    ok: true,
    requiresOverride: Boolean(selfGate && args.adminOverride),
  };
}
