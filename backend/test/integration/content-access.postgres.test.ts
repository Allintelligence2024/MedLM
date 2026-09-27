// Phase 2 — autorisations contenu + workflow, SQL réel (PGlite).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Test } from "@nestjs/testing";
import type { ExecutionContext, INestApplication } from "@nestjs/common";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ConfigService } from "@nestjs/config";
import { ContentController } from "../../src/content/content.controller";
import { ContentService } from "../../src/content/content.service";
import { DeckKeysController } from "../../src/deck-keys/deck-keys.controller";
import { DeckKeysService } from "../../src/deck-keys/deck-keys.service";
import { JwtGuard } from "../../src/auth/jwt.guard";
import { BillingService } from "../../src/billing/billing.service";
import { ChargilyPayProvider } from "../../src/billing/chargily.provider";
import { PromoCodeProvider } from "../../src/billing/promo-code.provider";
import type { Database } from "../../src/db/database.module";
import * as schema from "../../src/db/schema";
import type { Role } from "../../src/rbac/roles";

describe("Content — accès et workflow (PGlite)", () => {
  let app: INestApplication;
  let pg: PGlite;
  let db: Database;
  const session = {
    userId: "",
    role: "student" as Role,
  };

  const CARD_BODY = {
    content: {
      front_fr: "Question",
      back_fr: "Réponse",
      media: [],
    },
    source: { type: "original" as const, can_distribute_offline: true },
    tags: ["anat"],
  };

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
    const dir = join(__dirname, "../../src/db/migrations");
    const journal = JSON.parse(
      readFileSync(join(dir, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string }> };
    for (const entry of journal.entries) {
      const sql = readFileSync(join(dir, `${entry.tag}.sql`), "utf8").replace(
        /CREATE EXTENSION IF NOT EXISTS pgcrypto;?/g,
        "",
      );
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await pg.exec(statement);
      }
    }
    db = drizzle(pg, { schema }) as unknown as Database;
    const config = new ConfigService({ CHARGILY_API_SECRET: "test-secret" });
    const provider = new ChargilyPayProvider(config);
    vi.spyOn(provider, "createPayment").mockRejectedValue(new Error("unused"));
    vi.spyOn(provider, "retrieveCheckout").mockRejectedValue(
      new Error("unused"),
    );
    const billing = new BillingService(
      db,
      provider,
      new PromoCodeProvider(db),
      config,
    );
    const content = new ContentService(db, billing);
    const keys = new DeckKeysService(db, billing);
    const module = await Test.createTestingModule({
      controllers: [ContentController, DeckKeysController],
      providers: [
        { provide: ContentService, useValue: content },
        { provide: DeckKeysService, useValue: keys },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<{
            user?: { sub: string; kind: string; role: Role };
          }>();
          req.user = {
            sub: session.userId,
            kind: "access",
            role: session.role,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await pg?.close();
  });

  async function user(role: Role = "student") {
    const [row] = await db
      .insert(schema.users)
      .values({
        email: `${randomUUID()}@example.invalid`,
        rbacRole: role,
      })
      .returning();
    return row!;
  }

  async function entitle(userId: string) {
    await db.insert(schema.entitlements).values({
      userId,
      plan: "premium",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
  }

  async function graph(opts?: { premium?: boolean; published?: boolean }) {
    const premium = opts?.premium ?? true;
    const published = opts?.published ?? true;
    const author = await user("author");
    const [programme] = await db
      .insert(schema.programmes)
      .values({
        nameFr: "Médecine",
        country: "DZ",
        studyYear: 1,
      })
      .returning();
    const [mod] = await db
      .insert(schema.modules)
      .values({
        programmeId: programme!.id,
        nameFr: "Anatomie",
        isPremium: premium,
      })
      .returning();
    const [deck] = await db
      .insert(schema.decks)
      .values({
        moduleId: mod!.id,
        nameFr: premium ? "Premium" : "Gratuit",
        isPremium: premium,
        publishedAt: published ? new Date() : null,
      })
      .returning();
    const [card] = await db
      .insert(schema.cards)
      .values({
        deckId: deck!.id,
        type: "basic",
        status: published ? "published" : "draft",
        content: { front_fr: "Q", back_fr: "A" },
        isPremium: premium,
        createdBy: author.id,
        publishedAt: published ? new Date() : null,
      })
      .returning();
    return { author, deck: deck!, card: card! };
  }

  function asUser(id: string, role: Role) {
    session.userId = id;
    session.role = role;
  }

  it("un étudiant gratuit ne reçoit pas les cartes premium ni les brouillons", async () => {
    const published = await graph({ premium: true, published: true });
    const draft = await graph({ premium: true, published: false });
    const student = await user("student");
    asUser(student.id, "student");

    const catalog = await request(app.getHttpServer()).get("/v1/content/decks");
    expect(catalog.status).toBe(200);
    const ids = (catalog.body.items as Array<{ id: string }>).map((d) => d.id);
    expect(ids).toContain(published.deck.id);
    expect(ids).not.toContain(draft.deck.id);

    const premiumCards = await request(app.getHttpServer()).get(
      `/v1/content/decks/${published.deck.id}/cards`,
    );
    expect(premiumCards.status).toBe(403);

    const draftCards = await request(app.getHttpServer()).get(
      `/v1/content/decks/${draft.deck.id}/cards`,
    );
    expect(draftCards.status).toBe(404);

    const draftDetail = await request(app.getHttpServer()).get(
      `/v1/content/cards/${draft.card.id}`,
    );
    expect(draftDetail.status).toBe(404);

    const premiumDetail = await request(app.getHttpServer()).get(
      `/v1/content/cards/${published.card.id}`,
    );
    expect(premiumDetail.status).toBe(403);
  });

  it("un étudiant premium ne lit que le publié", async () => {
    const published = await graph({ premium: true, published: true });
    const draft = await graph({ premium: true, published: false });
    const student = await user("student");
    await entitle(student.id);
    asUser(student.id, "student");

    const cards = await request(app.getHttpServer()).get(
      `/v1/content/decks/${published.deck.id}/cards`,
    );
    expect(cards.status).toBe(200);
    expect(cards.body.items).toHaveLength(1);
    expect(cards.body.items[0].id).toBe(published.card.id);

    const hidden = await request(app.getHttpServer()).get(
      `/v1/content/cards/${draft.card.id}`,
    );
    expect(hidden.status).toBe(404);

    const cms = await request(app.getHttpServer()).get(
      "/v1/content/cards/list",
    );
    expect(cms.status).toBe(403);
  });

  it("un auteur ne voit pas et n’édite pas le brouillon d’un autre", async () => {
    const { author, card } = await graph({ premium: false, published: false });
    const stranger = await user("author");
    asUser(stranger.id, "author");

    const list = await request(app.getHttpServer()).get(
      "/v1/content/cards/list",
    );
    expect(list.status).toBe(200);
    expect(
      (list.body.items as Array<{ id: string }>).some((c) => c.id === card.id),
    ).toBe(false);

    const detail = await request(app.getHttpServer()).get(
      `/v1/content/cards/${card.id}`,
    );
    expect(detail.status).toBe(404);

    const patch = await request(app.getHttpServer())
      .patch(`/v1/content/cards/${card.id}`)
      .send(CARD_BODY);
    expect(patch.status).toBe(404);

    asUser(author.id, "author");
    const own = await request(app.getHttpServer()).get(
      `/v1/content/cards/${card.id}`,
    );
    expect(own.status).toBe(200);
    expect(own.body.status).toBe("draft");
  });

  it("un auteur ne peut pas approuver ni publier seul", async () => {
    const { author, card } = await graph({ premium: false, published: false });
    asUser(author.id, "author");
    const submit = await request(app.getHttpServer())
      .post(`/v1/content/cards/${card.id}/transition`)
      .send({ to: "review" });
    expect([200, 201]).toContain(submit.status);

    const approve = await request(app.getHttpServer())
      .post(`/v1/content/cards/${card.id}/transition`)
      .send({ to: "approved" });
    expect(approve.status).toBe(403);

    const reviewer = await user("medical_reviewer");
    asUser(reviewer.id, "medical_reviewer");
    const okApprove = await request(app.getHttpServer())
      .post(`/v1/content/cards/${card.id}/transition`)
      .send({ to: "approved" });
    expect([200, 201]).toContain(okApprove.status);

    const reviewerPublish = await request(app.getHttpServer())
      .post(`/v1/content/cards/${card.id}/transition`)
      .send({ to: "published" });
    expect(reviewerPublish.status).toBe(403);

    const editor = await user("editor");
    asUser(editor.id, "editor");
    const publish = await request(app.getHttpServer())
      .post(`/v1/content/cards/${card.id}/transition`)
      .send({ to: "published" });
    expect([200, 201]).toContain(publish.status);

    const versions = await db
      .select()
      .from(schema.cardVersions)
      .where(eq(schema.cardVersions.cardId, card.id));
    expect(versions.length).toBeGreaterThanOrEqual(2);

    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.targetId, card.id));
    expect(audits.some((a) => a.action === "content.card.transition")).toBe(
      true,
    );
  });

  it("un admin propriétaire ne publie qu’avec une dérogation auditée", async () => {
    const admin = await user("admin");
    const { card } = await graph({ premium: false, published: false });
    await db
      .update(schema.cards)
      .set({ createdBy: admin.id, status: "approved" })
      .where(eq(schema.cards.id, card.id));
    asUser(admin.id, "admin");

    const denied = await request(app.getHttpServer())
      .post(`/v1/content/cards/${card.id}/transition`)
      .send({ to: "published" });
    expect(denied.status).toBe(403);

    const forced = await request(app.getHttpServer())
      .post(`/v1/content/cards/${card.id}/transition`)
      .send({
        to: "published",
        admin_override: true,
        comment: "urgence pédagogique documentée",
      });
    expect([200, 201]).toContain(forced.status);

    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.targetId, card.id));
    expect(audits.some((a) => a.action === "content.card.admin_override")).toBe(
      true,
    );
  });

  it("wrap-key refuse sans entitlement et sans publication ; réussit avec les deux", async () => {
    const published = await graph({ premium: true, published: true });
    const draft = await graph({ premium: true, published: false });
    const student = await user("student");
    asUser(student.id, "student");
    const { publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const pem = publicKey.trim();
    const wrap = (deckId: string) =>
      request(app.getHttpServer())
        .get(`/v1/decks/${deckId}/wrap-key`)
        .query({ client_public_key: pem, device_id: "device-test-001" });

    const unpublished = await wrap(draft.deck.id);
    expect(unpublished.status).toBe(404);

    const unpaid = await wrap(published.deck.id);
    expect(unpaid.status).toBe(403);

    await entitle(student.id);
    const ok = await wrap(published.deck.id);
    expect(ok.status).toBe(200);
    expect(typeof ok.body.wrapped_key).toBe("string");
    expect(ok.body.algorithm).toBe("rsa-oaep-sha256");
  });
});
