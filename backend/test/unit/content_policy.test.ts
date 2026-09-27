import { describe, expect, it } from "vitest";
import {
  actorOf,
  cmsListScope,
  decideCardEdit,
  decideCardRead,
  decideLearnerDeckRead,
  decideTransition,
} from "../../src/content/content-policy";

const owner = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";

describe("content-policy — lectures", () => {
  it("un étudiant ne voit pas un brouillon (404, pas 403)", () => {
    expect(
      decideCardRead(
        actorOf(other, "student"),
        {
          status: "draft",
          isPremium: false,
          createdBy: owner,
          deckIsPremium: false,
        },
        false,
      ),
    ).toBe("not_found");
  });

  it("un étudiant gratuit est refusé sur une carte premium publiée", () => {
    expect(
      decideCardRead(
        actorOf(other, "student"),
        {
          status: "published",
          isPremium: true,
          createdBy: owner,
          deckIsPremium: true,
        },
        false,
      ),
    ).toBe("forbidden");
  });

  it("un étudiant premium lit une carte publiée premium", () => {
    expect(
      decideCardRead(
        actorOf(other, "student"),
        {
          status: "published",
          isPremium: true,
          createdBy: owner,
          deckIsPremium: true,
        },
        true,
      ),
    ).toBe("allow");
  });

  it("un auteur ne lit pas le brouillon d'un autre", () => {
    expect(
      decideCardRead(
        actorOf(other, "author"),
        {
          status: "draft",
          isPremium: false,
          createdBy: owner,
          deckIsPremium: false,
        },
        false,
      ),
    ).toBe("not_found");
  });

  it("un auteur lit son propre brouillon", () => {
    expect(
      decideCardRead(
        actorOf(owner, "author"),
        {
          status: "draft",
          isPremium: true,
          createdBy: owner,
          deckIsPremium: true,
        },
        false,
      ),
    ).toBe("allow");
  });

  it("un relecteur lit n’importe quel brouillon sans entitlement", () => {
    expect(
      decideCardRead(
        actorOf(other, "medical_reviewer"),
        {
          status: "review",
          isPremium: true,
          createdBy: owner,
          deckIsPremium: true,
        },
        false,
      ),
    ).toBe("allow");
  });

  it("un deck non publié est introuvable pour l’apprenant", () => {
    expect(
      decideLearnerDeckRead(
        actorOf(other, "student"),
        { publishedAt: null, isPremium: false },
        true,
      ),
    ).toBe("not_found");
  });

  it("un deck premium publié exige l’entitlement pour l’étudiant", () => {
    expect(
      decideLearnerDeckRead(
        actorOf(other, "student"),
        { publishedAt: new Date(), isPremium: true },
        false,
      ),
    ).toBe("forbidden");
  });

  it("la liste CMS d’un auteur est limitée à ses cartes", () => {
    expect(cmsListScope(actorOf(owner, "author"))).toBe("own");
    expect(cmsListScope(actorOf(owner, "medical_reviewer"))).toBe("all");
    expect(cmsListScope(actorOf(owner, "student"))).toBe("none");
  });

  it("un auteur n’édite pas une carte publiée ni celle d’autrui", () => {
    expect(
      decideCardEdit(actorOf(owner, "author"), {
        status: "published",
        createdBy: owner,
      }),
    ).toBe("forbidden");
    expect(
      decideCardEdit(actorOf(other, "author"), {
        status: "draft",
        createdBy: owner,
      }),
    ).toBe("not_found");
  });
});

describe("content-policy — workflow", () => {
  it("un auteur soumet son brouillon en relecture", () => {
    expect(
      decideTransition({
        from: "draft",
        to: "review",
        actor: actorOf(owner, "author"),
        ownerId: owner,
        adminOverride: false,
      }),
    ).toEqual({ ok: true, requiresOverride: false });
  });

  it("un auteur ne peut pas approuver ni publier, même sa carte", () => {
    expect(
      decideTransition({
        from: "review",
        to: "approved",
        actor: actorOf(owner, "author"),
        ownerId: owner,
        adminOverride: false,
      }).ok,
    ).toBe(false);
    expect(
      decideTransition({
        from: "approved",
        to: "published",
        actor: actorOf(owner, "author"),
        ownerId: owner,
        adminOverride: false,
      }).ok,
    ).toBe(false);
  });

  it("un relecteur n’approuve pas sa propre carte", () => {
    const d = decideTransition({
      from: "review",
      to: "approved",
      actor: actorOf(owner, "medical_reviewer"),
      ownerId: owner,
      adminOverride: false,
    });
    expect(d).toEqual({ ok: false, reason: "self_approval" });
  });

  it("un relecteur approuve la carte d’un autre", () => {
    expect(
      decideTransition({
        from: "review",
        to: "approved",
        actor: actorOf(other, "medical_reviewer"),
        ownerId: owner,
        adminOverride: false,
      }),
    ).toEqual({ ok: true, requiresOverride: false });
  });

  it("un relecteur ne publie pas", () => {
    const d = decideTransition({
      from: "approved",
      to: "published",
      actor: actorOf(other, "medical_reviewer"),
      ownerId: owner,
      adminOverride: false,
    });
    expect(d).toEqual({ ok: false, reason: "insufficient_role" });
  });

  it("un éditeur ne publie pas sa propre carte sans dérogation", () => {
    expect(
      decideTransition({
        from: "approved",
        to: "published",
        actor: actorOf(owner, "editor"),
        ownerId: owner,
        adminOverride: false,
      }),
    ).toEqual({ ok: false, reason: "self_approval" });
  });

  it("un éditeur publie la carte d’un autre", () => {
    expect(
      decideTransition({
        from: "approved",
        to: "published",
        actor: actorOf(other, "editor"),
        ownerId: owner,
        adminOverride: false,
      }),
    ).toEqual({ ok: true, requiresOverride: false });
  });

  it("un non-admin ne peut pas lever l’auto-approbation", () => {
    expect(
      decideTransition({
        from: "review",
        to: "approved",
        actor: actorOf(owner, "editor"),
        ownerId: owner,
        adminOverride: true,
      }),
    ).toEqual({ ok: false, reason: "override_forbidden" });
  });

  it("un admin propriétaire publie seulement avec dérogation", () => {
    expect(
      decideTransition({
        from: "approved",
        to: "published",
        actor: actorOf(owner, "admin"),
        ownerId: owner,
        adminOverride: false,
      }),
    ).toEqual({ ok: false, reason: "self_approval" });
    expect(
      decideTransition({
        from: "approved",
        to: "published",
        actor: actorOf(owner, "admin"),
        ownerId: owner,
        adminOverride: true,
      }),
    ).toEqual({ ok: true, requiresOverride: true });
  });

  it("refuse une arête absente du graphe", () => {
    expect(
      decideTransition({
        from: "draft",
        to: "published",
        actor: actorOf(other, "admin"),
        ownerId: owner,
        adminOverride: false,
      }),
    ).toEqual({ ok: false, reason: "illegal_transition" });
  });
});
