import { getRuntimeEnv, WechatApiError } from "@/lib/wechat";

type AIEnv = ReturnType<typeof getRuntimeEnv> & {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
};

export function getAIStatus() {
  const env = getRuntimeEnv() as AIEnv;
  return { configured: Boolean(env.OPENAI_API_KEY), model: env.OPENAI_MODEL || "gpt-5.6-luna" };
}

export async function generateStructured<T>(input: { instructions: string; prompt: string; schemaName: string; schema: Record<string, unknown>; maxOutputTokens?: number }): Promise<T> {
  const env = getRuntimeEnv() as AIEnv;
  if (!env.OPENAI_API_KEY) throw new WechatApiError(-1200, "AI 模型尚未配置，请先设置 OPENAI_API_KEY");
  const baseUrl = validateBaseUrl(env.OPENAI_BASE_URL || "https://api.openai.com/v1");
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6-luna",
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
    const url = new URL(value.replace(/\/$/, ""));
    const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) throw new Error("insecure base URL");
    return url.href.replace(/\/$/, "");
  } catch {
    throw new WechatApiError(-1205, "AI 接口地址格式不正确");
  }
}
