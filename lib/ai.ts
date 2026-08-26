import { decryptSecret, encryptSecret, getRuntimeEnv, WechatApiError } from "@/lib/wechat";

const AI_SETTING_ID = "default";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.6-luna";

type AISettingsRow = {
  provider: string;
  base_url: string;
  model: string;
  api_key_ciphertext: string;
  api_key_iv: string;
  updated_at: string;
};

type AIConfigInput = {
  provider?: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type SafeAIStatus = {
  configured: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  updatedAt: string | null;
};

export async function ensureAISettingsSchema() {
  const { DB } = getRuntimeEnv();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS ai_settings (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL DEFAULT 'openai',
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key_ciphertext TEXT NOT NULL,
    api_key_iv TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function getAIStatus(): Promise<SafeAIStatus> {
  await ensureAISettingsSchema();
  const row = await getSettingsRow();
  if (!row) {
    return {
      configured: false,
      provider: "openai",
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      apiKeyMasked: "",
      updatedAt: null,
    };
  }
  return {
    configured: true,
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    apiKeyMasked: "sk-••••••••••••",
    updatedAt: row.updated_at,
  };
}

export async function saveAIConfig(input: AIConfigInput) {
  await ensureAISettingsSchema();
  const { DB } = getRuntimeEnv();
  const baseUrl = validateBaseUrl(input.baseUrl || DEFAULT_BASE_URL);
  const model = input.model.trim();
  const provider = input.provider?.trim() || "openai";
  if (!model || model.length > 120) throw new WechatApiError(-1206, "请填写有效的模型名称");
  if (!/^[a-z0-9._:/-]+$/i.test(model)) throw new WechatApiError(-1206, "模型名称包含不支持的字符");

  const existing = await getSettingsRow();
  const submittedKey = input.apiKey?.trim() ?? "";
  if (!submittedKey && !existing) throw new WechatApiError(-1207, "请填写 API Key");
  const apiKey = submittedKey || await decryptSecret(existing!.api_key_ciphertext, existing!.api_key_iv);

  await verifyAIConnection({ baseUrl, model, apiKey });
  const encrypted = submittedKey
    ? await encryptSecret(submittedKey)
    : { ciphertext: existing!.api_key_ciphertext, iv: existing!.api_key_iv };
  await DB.prepare(`INSERT INTO ai_settings (
    id, provider, base_url, model, api_key_ciphertext, api_key_iv, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    provider = excluded.provider,
    base_url = excluded.base_url,
    model = excluded.model,
    api_key_ciphertext = excluded.api_key_ciphertext,
    api_key_iv = excluded.api_key_iv,
    updated_at = CURRENT_TIMESTAMP`).bind(
      AI_SETTING_ID,
      provider,
      baseUrl,
      model,
      encrypted.ciphertext,
      encrypted.iv,
    ).run();
  return getAIStatus();
}

export async function verifyAIConnection(input: { baseUrl: string; model: string; apiKey: string }) {
  const response = await fetch(`${input.baseUrl}/models/${encodeURIComponent(input.model)}`, {
    method: "GET",
    headers: { authorization: `Bearer ${input.apiKey}` },
  });
  if (response.ok) return;
  const raw = await response.text();
  let message = "";
  try { message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? ""; } catch { /* use fallback */ }
  if (response.status === 401) throw new WechatApiError(-1208, "API Key 验证失败，请检查后重试");
  if (response.status === 404) throw new WechatApiError(-1209, `未找到模型 ${input.model}，请检查模型名称`);
  throw new WechatApiError(-1210, message || `AI 服务连接失败（HTTP ${response.status}）`);
}

export async function generateStructured<T>(input: { instructions: string; prompt: string; schemaName: string; schema: Record<string, unknown>; maxOutputTokens?: number }): Promise<T> {
  await ensureAISettingsSchema();
  const row = await getSettingsRow();
  if (!row) throw new WechatApiError(-1200, "AI 模型尚未在页面中配置");
  const apiKey = await decryptSecret(row.api_key_ciphertext, row.api_key_iv);
  const baseUrl = validateBaseUrl(row.base_url);
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: row.model,
      instructions: input.instructions,
      input: input.prompt,
      store: false,
      max_output_tokens: input.maxOutputTokens ?? 3000,
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    }),
  });
  const raw = await response.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw) as Record<string, unknown>; } catch { throw new WechatApiError(-1201, "AI 服务返回了无法解析的响应"); }
  if (!response.ok) {
    const error = data.error as { message?: string } | undefined;
    throw new WechatApiError(-1202, error?.message || `AI 服务请求失败（HTTP ${response.status}）`);
  }
  const outputText = extractOutputText(data);
  try { return JSON.parse(outputText) as T; } catch { throw new WechatApiError(-1203, "AI 分析结果格式不完整，请重新生成"); }
}

async function getSettingsRow() {
  return getRuntimeEnv().DB.prepare(`SELECT provider, base_url, model,
    api_key_ciphertext, api_key_iv, updated_at FROM ai_settings WHERE id = ?`)
    .bind(AI_SETTING_ID).first<AISettingsRow>();
}

function extractOutputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  throw new WechatApiError(-1204, "AI 服务没有返回文本结果");
}

function validateBaseUrl(value: string) {
  try {
    const url = new URL(value.trim().replace(/\/$/, ""));
    const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) throw new Error("insecure base URL");
    if (url.username || url.password) throw new Error("credentials in URL");
    return url.href.replace(/\/$/, "");
  } catch {
    throw new WechatApiError(-1205, "AI 接口地址格式不正确，公网地址必须使用 HTTPS");
  }
}
