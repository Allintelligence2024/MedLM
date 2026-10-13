import { describe, expect, it } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import { ContentService } from "../../src/content/content.service";
import type { Database } from "../../src/db/database.module";
import type { BillingService } from "../../src/billing/billing.service";
import {
  ALLOWED_MEDIA_TYPES,
  R2MediaPresigner,
  UnprovisionedMediaPresigner,
  envMediaPresigner,
  presignS3Put,
  r2ConfigFromEnv,
  safeFilename,
} from "../../src/content/media-storage";

describe("safeFilename", () => {
  it("rejette une traversal et garde le basename", () => {
    expect(safeFilename("../../etc/passwd.png")).toBe("passwd.png");
    expect(safeFilename("ok_file-1.jpg")).toBe("ok_file-1.jpg");
  });

  it("rejette un nom vide apres nettoyage", () => {
    expect(() => safeFilename("...")).toThrow(/invalide/);
    expect(() => safeFilename("///")).toThrow(/invalide/);
  });
});

describe("presignS3Put", () => {
  const frozen = new Date("2026-01-15T12:00:00.000Z");
  const base = {
    endpointHost: "abc123.r2.cloudflarestorage.com",
    region: "auto",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    bucket: "medanki-media",
    objectKey: "media/user-1/id/photo.png",
    contentType: "image/png",
    expiresSeconds: 600,
    now: frozen,
  };

  it("est deterministe a horloge figee", () => {
    const a = presignS3Put(base);
    const b = presignS3Put(base);
    expect(a).toBe(b);
    expect(a).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(a).toContain("X-Amz-Signature=");
    expect(a).toContain("abc123.r2.cloudflarestorage.com");
    expect(a).toContain("medanki-media");
    expect(a.startsWith("https://")).toBe(true);
  });

  it("change la signature si le secret change", () => {
    const a = presignS3Put(base);
    const b = presignS3Put({ ...base, secretAccessKey: "other-secret" });
    const sig = (url: string) => url.split("X-Amz-Signature=")[1];
    expect(sig(a)).not.toBe(sig(b));
  });

  it("encode la cle objet", () => {
    const url = presignS3Put({
      ...base,
      objectKey: "media/user 1/id/photo.png",
    });
    expect(url).toContain("user%201");
    expect(url).not.toContain("user 1");
  });
});

describe("envMediaPresigner", () => {
  it("reste non provisionne si une variable manque", () => {
    expect(r2ConfigFromEnv({})).toBeNull();
    expect(
      r2ConfigFromEnv({
        R2_ACCOUNT_ID: "acc",
        R2_ACCESS_KEY_ID: "id",
        R2_SECRET_ACCESS_KEY: "sec",
        R2_BUCKET: "bkt",
      }),
    ).toBeNull();
    const p = envMediaPresigner({});
    expect(p.provisioned).toBe(false);
    expect(p).toBeInstanceOf(UnprovisionedMediaPresigner);
  });

  it("signe un PUT quand R2 est configure", () => {
    const p = new R2MediaPresigner(
      {
        accountId: "acc",
        accessKeyId: "id",
        secretAccessKey: "sec",
        bucket: "bkt",
        publicBaseUrl: "https://cdn.example.test",
      },
      () => new Date("2026-01-15T12:00:00.000Z"),
      () => "fixed-uuid",
    );
    const out = p.presign({
      userId: "user-1",
      filename: "photo.png",
      contentType: "image/png",
      sizeBytes: 12,
    });
    expect(out.key).toBe("media/user-1/fixed-uuid/photo.png");
    expect(out.public_url).toBe(
      "https://cdn.example.test/media/user-1/fixed-uuid/photo.png",
    );
    expect(out.expires_in).toBe(600);
    expect(out.upload_url).toContain("X-Amz-Signature=");
    expect(out.upload_url).toContain("acc.r2.cloudflarestorage.com");
  });

  it("refuse un type MIME hors allow-list", () => {
    const p = new R2MediaPresigner({
      accountId: "acc",
      accessKeyId: "id",
      secretAccessKey: "sec",
      bucket: "bkt",
      publicBaseUrl: "https://cdn.example.test",
    });
    expect(() =>
      p.presign({
        userId: "u",
        filename: "x.exe",
        contentType: "application/octet-stream",
        sizeBytes: 12,
      }),
    ).toThrow(/refuse/);
    expect(ALLOWED_MEDIA_TYPES.has("image/png")).toBe(true);
  });
});

describe("ContentService.presignMedia", () => {
  const args = {
    userId: "user-1",
    filename: "photo.png",
    content_type: "image/png",
    size_bytes: 12,
  };

  it("renvoie 501 si R2 n est pas provisionne", async () => {
    const svc = new ContentService(
      {} as Database,
      {} as BillingService,
      new UnprovisionedMediaPresigner(),
    );
    try {
      await svc.presignMedia(args);
      throw new Error("expected HttpException");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const http = err as HttpException;
      expect(http.getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
      expect(http.message).toBe("stockage média non provisionné");
    }
  });

  it("renvoie key et URLs signees si le store est provisionne", async () => {
    const svc = new ContentService({} as Database, {} as BillingService, {
      provisioned: true,
      presign: () => ({
        key: "media/user-1/id/photo.png",
        upload_url: "https://upload.example/put",
        public_url: "https://cdn.example/photo.png",
        expires_in: 600,
      }),
    });
    await expect(svc.presignMedia(args)).resolves.toEqual({
      key: "media/user-1/id/photo.png",
      upload_url: "https://upload.example/put",
      public_url: "https://cdn.example/photo.png",
      expires_in: 600,
    });
  });
});
