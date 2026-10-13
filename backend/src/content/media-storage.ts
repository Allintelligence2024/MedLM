/// Presign PUT S3-compatible (R2) — phase 5 / R11.
///
/// Sans identifiants : 501, jamais d'URL fictive. Avec identifiants : URL
/// signée SigV4 (query string), Content-Type figé, objet sous media/.
/// Pas de SDK AWS : HMAC local, testable sans réseau.
import { createHash, createHmac, randomUUID } from "node:crypto";

export const MEDIA_PRESIGNER = "MEDIA_PRESIGNER";

export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const MEDIA_PRESIGN_TTL_SECONDS = 600;

export const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
  "video/webm",
]);

export interface PresignInput {
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignResult {
  key: string;
  upload_url: string;
  public_url: string;
  expires_in: number;
}

export interface MediaPresigner {
  provisioned: boolean;
  presign(input: PresignInput): PresignResult;
}

export class MediaStorageError extends Error {
  constructor(
    readonly code: "not_provisioned" | "unsupported_type" | "invalid_filename",
    message: string,
  ) {
    super(message);
    this.name = "MediaStorageError";
  }
}

export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  const sliced = cleaned.slice(0, 80);
  if (!sliced || sliced === "_" || sliced === ".") {
    throw new MediaStorageError("invalid_filename", "nom de fichier invalide");
  }
  return sliced;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function amzDateOf(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = `${iso.slice(0, 15)}Z`;
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalUri(bucket: string, objectKey: string): string {
  const encodedKey = objectKey
    .split("/")
    .map((part) => encodeRfc3986(part))
    .join("/");
  return `/${encodeRfc3986(bucket)}/${encodedKey}`;
}

export function presignS3Put(args: {
  endpointHost: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  objectKey: string;
  contentType: string;
  expiresSeconds: number;
  now?: Date;
}): string {
  const { amzDate, dateStamp } = amzDateOf(args.now ?? new Date());
  const credential = `${args.accessKeyId}/${dateStamp}/${args.region}/s3/aws4_request`;
  const signedHeaders = "content-type;host";
  const uri = canonicalUri(args.bucket, args.objectKey);
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(args.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k]!)}`)
    .join("&");
  const canonicalHeaders = `content-type:${args.contentType}\nhost:${args.endpointHost}\n`;
  const canonicalRequest = [
    "PUT",
    uri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const scope = `${dateStamp}/${args.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmac(`AWS4${args.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, args.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");
  return `https://${args.endpointHost}${uri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export interface R2MediaConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  endpointHost?: string;
  region?: string;
}

export function r2ConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): R2MediaConfig | null {
  const accountId = env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = env.R2_BUCKET?.trim() ?? "";
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  const endpointHost =
    env.R2_ENDPOINT?.trim() || `${accountId}.r2.cloudflarestorage.com`;
  const region = env.R2_REGION?.trim() || "auto";
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    endpointHost,
    region,
  };
}

export class R2MediaPresigner implements MediaPresigner {
  constructor(
    private readonly config: R2MediaConfig,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => randomUUID(),
  ) {}

  get provisioned(): boolean {
    return true;
  }

  presign(input: PresignInput): PresignResult {
    if (!ALLOWED_MEDIA_TYPES.has(input.contentType)) {
      throw new MediaStorageError(
        "unsupported_type",
        `type media refuse : ${input.contentType}`,
      );
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > MEDIA_MAX_BYTES) {
      throw new MediaStorageError("invalid_filename", "taille media invalide");
    }
    const name = safeFilename(input.filename);
    const key = `media/${input.userId}/${this.idFactory()}/${name}`;
    const host =
      this.config.endpointHost ??
      `${this.config.accountId}.r2.cloudflarestorage.com`;
    const upload_url = presignS3Put({
      endpointHost: host,
      region: this.config.region ?? "auto",
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      bucket: this.config.bucket,
      objectKey: key,
      contentType: input.contentType,
      expiresSeconds: MEDIA_PRESIGN_TTL_SECONDS,
      now: this.clock(),
    });
    return {
      key,
      upload_url,
      public_url: `${this.config.publicBaseUrl}/${key}`,
      expires_in: MEDIA_PRESIGN_TTL_SECONDS,
    };
  }
}

export class UnprovisionedMediaPresigner implements MediaPresigner {
  readonly provisioned = false;
  presign(_input: PresignInput): PresignResult {
    throw new MediaStorageError(
      "not_provisioned",
      "stockage média non provisionné",
    );
  }
}

export function envMediaPresigner(
  env: NodeJS.ProcessEnv = process.env,
): MediaPresigner {
  const cfg = r2ConfigFromEnv(env);
  return cfg ? new R2MediaPresigner(cfg) : new UnprovisionedMediaPresigner();
}
