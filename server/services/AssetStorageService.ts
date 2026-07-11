import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaAsset } from "../../src/types/domain";
import { env } from "../env";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const storageRoot = join(__dirname, "..", "storage", "media");

type StoredPayload = {
  body: Buffer;
  contentType: string;
};

export class AssetStorageService {
  private readonly s3 = createS3Client();

  async persistAsset(projectId: string, asset: MediaAsset): Promise<MediaAsset> {
    if (!asset.url) return asset;
    if (asset.storageKey && asset.url.includes(`/api/projects/${encodeURIComponent(projectId)}/assets/`)) {
      return asset;
    }

    const payload = await loadAssetPayload(asset.url);
    const extension = inferExtension(asset, payload.contentType);
    const storageKey = buildStorageKey(projectId, asset.id, extension);
    await this.writeStoredPayload(storageKey, payload);

    return {
      ...asset,
      storageKey,
      url: this.assetUrl(projectId, asset.id)
    };
  }

  async persistAssets(projectId: string, assets: MediaAsset[]): Promise<MediaAsset[]> {
    const settled = await Promise.allSettled(assets.map((asset) => this.persistAsset(projectId, asset)));
    return settled.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      return assets[index];
    });
  }

  async loadAsset(asset: MediaAsset): Promise<StoredPayload> {
    if (asset.storageKey) {
      return this.readStoredPayload(asset.storageKey);
    }
    return loadAssetPayload(asset.url);
  }

  async deleteAsset(asset: MediaAsset): Promise<void> {
    if (!asset.storageKey) return;

    if (env.STORAGE_PROVIDER === "s3") {
      assertS3Config();
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: env.STORAGE_BUCKET,
          Key: withStoragePrefix(asset.storageKey)
        })
      );
      return;
    }

    await rm(join(storageRoot, asset.storageKey), { force: true });
  }

  assetUrl(projectId: string, assetId: string): string {
    return `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/file`;
  }

  private async writeStoredPayload(storageKey: string, payload: StoredPayload) {
    if (env.STORAGE_PROVIDER === "s3") {
      assertS3Config();
      await this.s3.send(
        new PutObjectCommand({
          Bucket: env.STORAGE_BUCKET,
          Key: withStoragePrefix(storageKey),
          Body: payload.body,
          ContentType: payload.contentType
        })
      );
      return;
    }

    const absolutePath = join(storageRoot, storageKey);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, payload.body);
  }

  private async readStoredPayload(storageKey: string): Promise<StoredPayload> {
    if (env.STORAGE_PROVIDER === "s3") {
      assertS3Config();
      const object = await this.s3.send(
        new GetObjectCommand({
          Bucket: env.STORAGE_BUCKET,
          Key: withStoragePrefix(storageKey)
        })
      );
      return {
        body: await streamToBuffer(object.Body),
        contentType: object.ContentType || inferContentType(storageKey)
      };
    }

    const body = await readFile(join(storageRoot, storageKey));
    return {
      body,
      contentType: inferContentType(storageKey, body)
    };
  }
}

function createS3Client(): S3Client {
  return new S3Client({
    region: env.STORAGE_REGION || "auto",
    endpoint: env.STORAGE_ENDPOINT,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === "true",
    credentials:
      env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.STORAGE_ACCESS_KEY_ID,
            secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY
          }
        : undefined
  });
}

function assertS3Config() {
  const missing = [
    ["STORAGE_BUCKET", env.STORAGE_BUCKET],
    ["STORAGE_ACCESS_KEY_ID", env.STORAGE_ACCESS_KEY_ID],
    ["STORAGE_SECRET_ACCESS_KEY", env.STORAGE_SECRET_ACCESS_KEY]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`S3 storage is enabled but missing env: ${missing.join(", ")}`);
  }
}

function withStoragePrefix(storageKey: string): string {
  const prefix = env.STORAGE_PREFIX?.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${storageKey}` : storageKey;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) throw new Error("Stored asset body is empty");
  if (body instanceof Uint8Array) return Buffer.from(body);

  const withTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof withTransform.transformToByteArray === "function") {
    return Buffer.from(await withTransform.transformToByteArray());
  }

  const withArrayBuffer = body as { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof withArrayBuffer.arrayBuffer === "function") {
    return Buffer.from(await withArrayBuffer.arrayBuffer());
  }

  if (Symbol.asyncIterator in Object(body)) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported stored asset body type");
}

async function loadAssetPayload(url: string): Promise<StoredPayload> {
  if (url.startsWith("data:")) return loadDataUrlPayload(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset download failed: ${response.status}`);
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream"
  };
}

function loadDataUrlPayload(url: string): StoredPayload {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match) throw new Error("Invalid data URL asset");
  const contentType = match[1] || "application/octet-stream";
  const encoded = match[3] || "";
  return {
    body: match[2] ? Buffer.from(encoded, "base64") : Buffer.from(decodeURIComponent(encoded)),
    contentType
  };
}

function buildStorageKey(projectId: string, assetId: string, extension: string): string {
  return join(sanitizePathPart(projectId), `${sanitizePathPart(assetId)}${extension}`).replace(/\\/g, "/");
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "asset";
}

function inferExtension(asset: MediaAsset, contentType: string): string {
  const fromUrl = extensionFromUrl(asset.url);
  if (fromUrl) return fromUrl;
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("svg")) return ".svg";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("mp4")) return ".mp4";
  if (contentType.includes("quicktime")) return ".mov";
  if (contentType.includes("webm")) return ".webm";
  return asset.type === "video" ? ".mp4" : ".png";
}

function extensionFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    return extname(pathname).toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

function inferContentType(storageKey: string, body?: Buffer): string {
  const sniffed = body ? sniffContentType(body) : undefined;
  if (sniffed) return sniffed;

  switch (extname(storageKey).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}

function sniffContentType(body: Buffer): string | undefined {
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }
  if (body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  const start = body.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  if (start.startsWith("<svg") || start.startsWith("<?xml") && start.includes("<svg")) {
    return "image/svg+xml";
  }

  return undefined;
}
