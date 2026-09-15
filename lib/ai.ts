import { decryptSecret, encryptSecret, getRuntimeEnv, WechatApiError } from "@/lib/wechat";

const AI_SETTING_ID = "default";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.6-luna";

type AIProvider = "openai" | "litellm";

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

type ModelListInput = {
  provider?: string;
  baseUrl: string;
  apiKey?: string;
};

type StructuredInput = {
  instructions: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
};

type TextInput = {
  instructions: string;
  prompt: string;
  maxOutputTokens?: number;
};

export type SafeAIStatus = {
  configured: boolean;
  provider: AIProvider;
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
    provider: normalizeProvider(row.provider),
    baseUrl: row.base_url,
    model: row.model,
    apiKeyMasked: "sk-••••••••••••",
    updatedAt: row.updated_at,
  };
}

export async function listAIModels(input: ModelListInput) {
  await ensureAISettingsSchema();
  const baseUrl = validateBaseUrl(input.baseUrl || DEFAULT_BASE_URL);
  const apiKey = await resolveApiKey(input.apiKey);
  const response = await fetch(buildAIUrl(baseUrl, "models"), {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await parseJsonResponse(response, "模型列表");
  if (!response.ok) throwModelListError(response.status, data);
  const rows = Array.isArray(data.data) ? data.data : [];
  const models = [...new Set(rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const id = (item as { id?: unknown }).id;
    return typeof id === "string" && id.trim() ? [id.trim()] : [];
  }))].sort((a, b) => a.localeCompare(b));
  if (!models.length) throw new WechatApiError(-1211, "网关已连接，但没有返回当前密钥可用的模型");
  return { provider: normalizeProvider(input.provider), baseUrl, models };
}

export async function saveAIConfig(input: AIConfigInput) {
  await ensureAISettingsSchema();
  const { DB } = getRuntimeEnv();
  const baseUrl = validateBaseUrl(input.baseUrl || DEFAULT_BASE_URL);
  const model = input.model.trim();
  const provider = normalizeProvider(input.provider);
  if (!model || model.length > 160) throw new WechatApiError(-1206, "请选择或填写有效的模型名称");
  if (!/^[a-z0-9._:/-]+$/i.test(model)) throw new WechatApiError(-1206, "模型名称包含不支持的字符");

  const existing = await getSettingsRow();
  const submittedKey = input.apiKey?.trim() ?? "";
  const apiKey = await resolveApiKey(submittedKey);
  const { models } = await listAIModels({ provider, baseUrl, apiKey });
  if (!models.includes(model)) {
    throw new WechatApiError(-1209, `当前密钥的模型列表中没有 ${model}，请重新获取并选择`);
  }

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

export async function generateStructured<T>(input: StructuredInput): Promise<T> {
  await ensureAISettingsSchema();
  const row = await getSettingsRow();
  if (!row) throw new WechatApiError(-1200, "AI 模型尚未在页面中配置");
  const apiKey = await decryptSecret(row.api_key_ciphertext, row.api_key_iv);
  const baseUrl = validateBaseUrl(row.base_url);
  const outputText = normalizeProvider(row.provider) === "litellm"
    ? await generateViaChatCompletions({ row, baseUrl, apiKey, input })
    : await generateViaResponses({ row, baseUrl, apiKey, input });
  const parsed = tryParseStructuredOutput<T>(outputText);
  if (parsed.ok) return parsed.value;

  const repairInput: StructuredInput = {
    schemaName: `${input.schemaName}_repair`.slice(0, 64),
    schema: input.schema,
    maxOutputTokens: Math.max(input.maxOutputTokens ?? 3000, 5000),
    instructions: "你是 JSON 结果修复器。只输出符合给定 JSON Schema 的完整 JSON 对象，不要解释，不要输出 Markdown 代码围栏。若原结果被截断，请依据已有内容补全缺失字段，但不要添加 Schema 之外的字段。",
    prompt: `请修复下面的模型结果并输出完整 JSON：\n\n${outputText.slice(0, 24000)}`,
  };
  const repairedText = normalizeProvider(row.provider) === "litellm"
    ? await generateViaChatCompletions({ row, baseUrl, apiKey, input: repairInput })
    : await generateViaResponses({ row, baseUrl, apiKey, input: repairInput });
  const repaired = tryParseStructuredOutput<T>(repairedText);
  if (repaired.ok) return repaired.value;
  throw new WechatApiError(-1203, "AI 返回格式异常，系统已自动重试但仍未完成，请更换模型后再试");
}

export async function generateText(input: TextInput): Promise<string> {
  await ensureAISettingsSchema();
  const row = await getSettingsRow();
  if (!row) throw new WechatApiError(-1200, "AI 模型尚未在页面中配置");
  const apiKey = await decryptSecret(row.api_key_ciphertext, row.api_key_iv);
  const baseUrl = validateBaseUrl(row.base_url);
  return normalizeProvider(row.provider) === "litellm"
    ? generateTextViaChatCompletions({ row, baseUrl, apiKey, input })
    : generateTextViaResponses({ row, baseUrl, apiKey, input });
}

async function generateViaResponses(input: { row: AISettingsRow; baseUrl: string; apiKey: string; input: StructuredInput }) {
  const response = await fetch(buildAIUrl(input.baseUrl, "responses"), {
    method: "POST",
    headers: authJsonHeaders(input.apiKey),
    body: JSON.stringify({
      model: input.row.model,
      instructions: input.input.instructions,
      input: input.input.prompt,
      store: false,
      max_output_tokens: input.input.maxOutputTokens ?? 3000,
      text: {
        format: {
          type: "json_schema",
          name: input.input.schemaName,
          strict: true,
          schema: input.input.schema,
        },
      },
    }),
  });
  const data = await parseJsonResponse(response, "AI 服务");
  if (!response.ok) throwServiceError(response.status, data);
  return extractResponseOutputText(data);
}

async function generateViaChatCompletions(input: { row: AISettingsRow; baseUrl: string; apiKey: string; input: StructuredInput }) {
  const requestBody: Record<string, unknown> = {
    model: input.row.model,
    messages: [
      { role: "system", content: `${input.input.instructions}\n你必须只输出一个符合指定 JSON Schema 的 JSON 对象，不要输出 Markdown 代码围栏。` },
      { role: "user", content: `${input.input.prompt}\n\nJSON Schema：\n${JSON.stringify(input.input.schema)}` },
    ],
    max_tokens: input.input.maxOutputTokens ?? 3000,
    response_format: { type: "json_object" },
  };
  let response = await fetch(buildAIUrl(input.baseUrl, "chat/completions"), {
    method: "POST",
    headers: authJsonHeaders(input.apiKey),
    body: JSON.stringify(requestBody),
  });
  // Some LiteLLM upstream models do not accept response_format. Retry once
  // without it while retaining the explicit schema in the prompt.
  if (response.status === 400) {
    delete requestBody.response_format;
    response = await fetch(buildAIUrl(input.baseUrl, "chat/completions"), {
      method: "POST",
      headers: authJsonHeaders(input.apiKey),
      body: JSON.stringify(requestBody),
    });
  }
  const data = await parseJsonResponse(response, "LiteLLM 网关");
  if (!response.ok) throwServiceError(response.status, data);
  return extractChatCompletionText(data);
}

async function generateTextViaResponses(input: { row: AISettingsRow; baseUrl: string; apiKey: string; input: TextInput }) {
  const response = await fetch(buildAIUrl(input.baseUrl, "responses"), {
    method: "POST",
    headers: authJsonHeaders(input.apiKey),
    body: JSON.stringify({
      model: input.row.model,
      instructions: input.input.instructions,
      input: input.input.prompt,
      store: false,
      max_output_tokens: input.input.maxOutputTokens ?? 6000,
    }),
  });
  const data = await parseJsonResponse(response, "AI 服务");
  if (!response.ok) throwServiceError(response.status, data);
  return extractResponseOutputText(data);
}

async function generateTextViaChatCompletions(input: { row: AISettingsRow; baseUrl: string; apiKey: string; input: TextInput }) {
  const response = await fetch(buildAIUrl(input.baseUrl, "chat/completions"), {
    method: "POST",
    headers: authJsonHeaders(input.apiKey),
    body: JSON.stringify({
      model: input.row.model,
      messages: [
        { role: "system", content: input.input.instructions },
        { role: "user", content: input.input.prompt },
      ],
      max_tokens: input.input.maxOutputTokens ?? 6000,
    }),
  });
  const data = await parseJsonResponse(response, "LiteLLM 网关");
  if (!response.ok) throwServiceError(response.status, data);
  return extractChatCompletionText(data);
}

function extractChatCompletionText(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as { message?: { content?: unknown } }).message
    : undefined;
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    const text = message.content.flatMap((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? [(part as { text: string }).text] : []).join("");
    if (text) return text;
  }
  throw new WechatApiError(-1204, "LiteLLM 网关没有返回文本结果");
}

async function resolveApiKey(submitted?: string) {
  const value = submitted?.trim() ?? "";
  if (value) return value;
  const existing = await getSettingsRow();
  if (!existing) throw new WechatApiError(-1207, "请填写 API Key");
  return decryptSecret(existing.api_key_ciphertext, existing.api_key_iv);
}

async function getSettingsRow() {
  return getRuntimeEnv().DB.prepare(`SELECT provider, base_url, model,
    api_key_ciphertext, api_key_iv, updated_at FROM ai_settings WHERE id = ?`)
    .bind(AI_SETTING_ID).first<AISettingsRow>();
}

function buildAIUrl(baseUrl: string, resource: string) {
  const url = new URL(validateBaseUrl(baseUrl));
  const basePath = url.pathname.replace(/\/+$/, "");
  const versionedPath = /\/v1$/i.test(basePath) ? basePath : `${basePath}/v1`;
  url.pathname = `${versionedPath}/${resource.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.href;
}

function authJsonHeaders(apiKey: string) {
  return { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
}

async function parseJsonResponse(response: Response, serviceName: string) {
  const raw = await response.text();
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new WechatApiError(-1201, `${serviceName}返回了无法解析的响应`); }
}

function throwModelListError(status: number, data: Record<string, unknown>): never {
  const message = readErrorMessage(data);
  if (status === 401) throw new WechatApiError(-1208, "API Key 验证失败，请检查后重试");
  if (status === 403) throw new WechatApiError(-1212, "网关拒绝读取模型列表（HTTP 403），请确认 LiteLLM Virtual Key 具有模型访问权限");
  if (status === 404) throw new WechatApiError(-1213, "没有找到 /v1/models 接口，请确认填写的是 OpenAI 或 LiteLLM 网关地址");
  throw new WechatApiError(-1210, message || `模型列表获取失败（HTTP ${status}）`);
}

function throwServiceError(status: number, data: Record<string, unknown>): never {
  const message = readErrorMessage(data);
  if (status === 401 || status === 403) throw new WechatApiError(-1208, message || "AI 网关鉴权失败，请检查密钥与模型权限");
  throw new WechatApiError(-1202, message || `AI 服务请求失败（HTTP ${status}）`);
}

function readErrorMessage(data: Record<string, unknown>) {
  const error = data.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  if (typeof data.detail === "string") return data.detail;
  return "";
}

function extractResponseOutputText(data: Record<string, unknown>) {
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

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function tryParseStructuredOutput<T>(value: string): { ok: true; value: T } | { ok: false } {
  const normalized = stripCodeFence(value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim());
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  const candidates = [normalized];
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(normalized.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try { return { ok: true, value: JSON.parse(candidate) as T }; } catch { /* try the extracted JSON object */ }
  }
  return { ok: false };
}

function normalizeProvider(value?: string): AIProvider {
  return value === "litellm" ? "litellm" : "openai";
}

function validateBaseUrl(value: string) {
  try {
    const url = new URL(value.trim().replace(/\/$/, ""));
    const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) throw new Error("insecure base URL");
    if (url.username || url.password || url.search || url.hash) throw new Error("unsupported URL parts");
    return url.href.replace(/\/$/, "");
  } catch {
    throw new WechatApiError(-1205, "AI 接口地址格式不正确，公网地址必须使用 HTTPS");
  }
}
