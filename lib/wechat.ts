import { env } from "cloudflare:workers";

type RuntimeEnv = typeof env & {
  DB: D1Database;
  DRAFTFLOW_ENCRYPTION_KEY?: string;
};

type AccountRow = {
  id: string;
  name: string;
  app_id: string;
  app_secret_ciphertext: string;
  app_secret_iv: string;
  default_author: string;
  access_token_ciphertext: string | null;
  access_token_iv: string | null;
  token_expires_at: number | null;
  updated_at: string;
};

type TokenResult = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

export class WechatApiError extends Error {
  code: number;

  constructor(code: number, message?: string) {
    super(wechatErrorMessage(code, message));
    this.name = "WechatApiError";
    this.code = code;
  }
}

export function getRuntimeEnv(): RuntimeEnv {
  return env as RuntimeEnv;
}

export async function ensureWechatSchema() {
  const { DB } = getRuntimeEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS wechat_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      app_id TEXT NOT NULL UNIQUE,
      app_secret_ciphertext TEXT NOT NULL,
      app_secret_iv TEXT NOT NULL,
      default_author TEXT NOT NULL DEFAULT '编辑部',
      access_token_ciphertext TEXT,
      access_token_iv TEXT,
      token_expires_at INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS sync_records (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      title TEXT NOT NULL,
      draft_media_id TEXT,
      status TEXT NOT NULL,
      error_code INTEGER,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_sync_records_created_at ON sync_records(created_at)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_sync_records_account_id ON sync_records(account_id)"),
  ]);
}

export async function getSafeAccount() {
  await ensureWechatSchema();
  const row = await getRuntimeEnv().DB.prepare(
    "SELECT id, name, app_id, default_author, updated_at FROM wechat_accounts WHERE id = ?",
  ).bind("primary").first<{ id: string; name: string; app_id: string; default_author: string; updated_at: string }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    appIdMasked: maskAppId(row.app_id),
    defaultAuthor: row.default_author,
    updatedAt: row.updated_at,
  };
}

export async function configureWechatAccount(input: {
  name: string;
  appId: string;
  appSecret: string;
  defaultAuthor: string;
}) {
  await ensureWechatSchema();
  const token = await fetchStableAccessToken(input.appId, input.appSecret);
  const secret = await encrypt(input.appSecret);
  const encryptedToken = await encrypt(token.accessToken);
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, token.expiresIn - 300);
  await getRuntimeEnv().DB.prepare(`INSERT INTO wechat_accounts (
    id, name, app_id, app_secret_ciphertext, app_secret_iv, default_author,
    access_token_ciphertext, access_token_iv, token_expires_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    app_id = excluded.app_id,
    app_secret_ciphertext = excluded.app_secret_ciphertext,
    app_secret_iv = excluded.app_secret_iv,
    default_author = excluded.default_author,
    access_token_ciphertext = excluded.access_token_ciphertext,
    access_token_iv = excluded.access_token_iv,
    token_expires_at = excluded.token_expires_at,
    updated_at = CURRENT_TIMESTAMP`).bind(
      "primary",
      input.name,
      input.appId,
      secret.ciphertext,
      secret.iv,
      input.defaultAuthor,
      encryptedToken.ciphertext,
      encryptedToken.iv,
      expiresAt,
    ).run();
  return getSafeAccount();
}

export async function getAccessToken() {
  await ensureWechatSchema();
  const { DB } = getRuntimeEnv();
  const row = await DB.prepare("SELECT * FROM wechat_accounts WHERE id = ?")
    .bind("primary")
    .first<AccountRow>();
  if (!row) throw new WechatApiError(-1001, "请先配置公众号 AppID 和 AppSecret");

  const now = Math.floor(Date.now() / 1000);
  if (row.access_token_ciphertext && row.access_token_iv && (row.token_expires_at ?? 0) > now + 60) {
    return decrypt(row.access_token_ciphertext, row.access_token_iv);
  }

  const appSecret = await decrypt(row.app_secret_ciphertext, row.app_secret_iv);
  const token = await fetchStableAccessToken(row.app_id, appSecret);
  const encryptedToken = await encrypt(token.accessToken);
  const expiresAt = now + Math.max(60, token.expiresIn - 300);
  await DB.prepare(`UPDATE wechat_accounts SET
    access_token_ciphertext = ?, access_token_iv = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`).bind(encryptedToken.ciphertext, encryptedToken.iv, expiresAt, row.id).run();
  return token.accessToken;
}

export async function addSyncRecord(input: {
  title: string;
  status: "success" | "failed";
  draftMediaId?: string;
  errorCode?: number;
  errorMessage?: string;
}) {
  await ensureWechatSchema();
  await getRuntimeEnv().DB.prepare(`INSERT INTO sync_records (
    id, account_id, title, draft_media_id, status, error_code, error_message
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(),
    "primary",
    input.title,
    input.draftMediaId ?? null,
    input.status,
    input.errorCode ?? null,
    input.errorMessage ?? null,
  ).run();
}

export async function getSyncHistory() {
  await ensureWechatSchema();
  const result = await getRuntimeEnv().DB.prepare(`SELECT
    id, title, draft_media_id, status, error_code, error_message, created_at
    FROM sync_records ORDER BY created_at DESC LIMIT 20`).all();
  return result.results;
}

export async function wechatJson<T extends { errcode?: number; errmsg?: string }>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json<T>();
  if (!response.ok) throw new WechatApiError(response.status, `微信接口请求失败（HTTP ${response.status}）`);
  if (typeof data.errcode === "number" && data.errcode !== 0) throw new WechatApiError(data.errcode, data.errmsg);
  return data;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new WechatApiError(-1002, "请求来源校验失败");
  }
}

export function sanitizeWechatHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
}

export function errorResponse(error: unknown) {
  if (error instanceof WechatApiError) {
    return Response.json({ ok: false, error: error.message, code: error.code }, { status: error.code === -1001 ? 409 : 400 });
  }
  const message = error instanceof Error ? error.message : "服务器处理失败";
  return Response.json({ ok: false, error: message }, { status: 500 });
}

async function fetchStableAccessToken(appId: string, appSecret: string) {
  const data = await wechatJson<TokenResult>("https://api.weixin.qq.com/cgi-bin/stable_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credential", appid: appId, secret: appSecret, force_refresh: false }),
  });
  if (!data.access_token) throw new WechatApiError(-1003, "微信未返回 access_token");
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 7200 };
}

async function encryptionKey() {
  const encoded = getRuntimeEnv().DRAFTFLOW_ENCRYPTION_KEY;
  if (!encoded) throw new WechatApiError(-1004, "服务端尚未配置凭证加密密钥");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  } catch {
    throw new WechatApiError(-1004, "凭证加密密钥格式无效");
  }
  if (bytes.byteLength !== 32) throw new WechatApiError(-1004, "凭证加密密钥必须是 32 字节 Base64 字符串");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return { ciphertext: toBase64(new Uint8Array(cipher)), iv: toBase64(iv) };
}

async function decrypt(ciphertext: string, iv: string) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await encryptionKey(),
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(plain);
}

function toBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function maskAppId(appId: string) {
  if (appId.length < 8) return `${appId.slice(0, 2)}••••`;
  return `${appId.slice(0, 4)}••••••${appId.slice(-4)}`;
}

function wechatErrorMessage(code: number, fallback?: string) {
  if (code === 40164) {
    const ip = fallback?.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];
    return ip ? `当前服务器 IP（${ip}）不在公众号白名单中` : "当前服务器 IP 不在公众号白名单中";
  }
  const messages: Record<number, string> = {
    40013: "AppID 无效，请检查后重试",
    40125: "AppSecret 无效，可能已被重置",
    40001: "接口凭证无效或已过期",
    40007: "封面素材无效，请重新上传",
    41005: "缺少上传文件",
    45009: "微信接口调用次数已达到上限",
    45028: "草稿数量已达到上限，请先清理公众号草稿箱",
    48001: "当前公众号没有此接口权限，请检查认证与接口权限",
  };
  return messages[code] ?? fallback ?? `微信接口返回错误 ${code}`;
}
