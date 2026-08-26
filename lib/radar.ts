import { getRuntimeEnv, WechatApiError } from "@/lib/wechat";

export type RadarArticle = {
  id: string;
  source_id: string | null;
  source_name: string;
  title: string;
  url: string;
  digest: string;
  content_excerpt: string;
  published_at: string | null;
  read_count: number;
  like_count: number;
  hot_score: number;
  created_at: string;
};

export async function ensureRadarSchema() {
  const { DB } = getRuntimeEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS content_sources (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'wechat',
      source_url TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_checked_at TEXT
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS radar_articles (
      id TEXT PRIMARY KEY NOT NULL,
      source_id TEXT,
      source_name TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      digest TEXT NOT NULL DEFAULT '',
      content_excerpt TEXT NOT NULL DEFAULT '',
      published_at TEXT,
      read_count INTEGER NOT NULL DEFAULT 0,
      like_count INTEGER NOT NULL DEFAULT 0,
      hot_score INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_radar_articles_hot_score ON radar_articles(hot_score)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_radar_articles_source_id ON radar_articles(source_id)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS content_recommendations (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      angle TEXT NOT NULL,
      audience TEXT NOT NULL,
      outline_json TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      predicted_score INTEGER NOT NULL DEFAULT 70,
      source_article_ids_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_content_recommendations_created_at ON content_recommendations(created_at)"),
  ]);
  await DB.prepare("PRAGMA optimize").run();
}

export async function listContentSources() {
  await ensureRadarSchema();
  const result = await getRuntimeEnv().DB.prepare("SELECT * FROM content_sources ORDER BY created_at DESC").all();
  return result.results;
}

export async function addContentSource(input: { name: string; sourceType: "wechat" | "rss"; sourceUrl?: string }) {
  await ensureRadarSchema();
  const id = crypto.randomUUID();
  await getRuntimeEnv().DB.prepare(`INSERT INTO content_sources (id, name, source_type, source_url)
    VALUES (?, ?, ?, ?)`)
    .bind(id, input.name, input.sourceType, input.sourceUrl || null).run();
  return id;
}

export async function listRadarArticles() {
  await ensureRadarSchema();
  const result = await getRuntimeEnv().DB.prepare("SELECT * FROM radar_articles ORDER BY hot_score DESC, created_at DESC LIMIT 100").all<RadarArticle>();
  return result.results;
}

export async function importWechatArticle(input: { url: string; sourceId?: string; readCount?: number; likeCount?: number }) {
  await ensureRadarSchema();
  const url = validateWechatArticleUrl(input.url);
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 (compatible; DraftFlowContentRadar/1.0)" },
  });
  if (!response.ok) throw new WechatApiError(-1101, `文章读取失败（HTTP ${response.status}），可稍后重试`);
  const html = await response.text();
  const title = readMeta(html, "og:title") || readTag(html, "title");
  const digest = readMeta(html, "og:description") || readMeta(html, "description");
  const detectedSource = readMeta(html, "og:article:author") || readScriptValue(html, "nickname") || "微信公众号";
  const source = input.sourceId
    ? await getRuntimeEnv().DB.prepare("SELECT id, name FROM content_sources WHERE id = ?").bind(input.sourceId).first<{ id: string; name: string }>()
    : null;
  if (!title) throw new WechatApiError(-1102, "没有识别到文章标题，请确认链接可以公开访问");

  const excerpt = extractArticleText(html).slice(0, 6000);
  const publishedAt = readPublishTime(html);
  const readCount = Math.max(0, Math.round(input.readCount ?? 0));
  const likeCount = Math.max(0, Math.round(input.likeCount ?? 0));
  const hotScore = calculateHotScore({ readCount, likeCount, publishedAt, textLength: excerpt.length });
  const id = crypto.randomUUID();
  await getRuntimeEnv().DB.prepare(`INSERT INTO radar_articles (
    id, source_id, source_name, title, url, digest, content_excerpt, published_at,
    read_count, like_count, hot_score, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(url) DO UPDATE SET
    source_id = excluded.source_id, source_name = excluded.source_name,
    title = excluded.title, digest = excluded.digest, content_excerpt = excluded.content_excerpt,
    published_at = excluded.published_at, read_count = excluded.read_count,
    like_count = excluded.like_count, hot_score = excluded.hot_score`)
    .bind(id, source?.id ?? null, source?.name ?? detectedSource, decodeHtml(title), url, decodeHtml(digest), excerpt, publishedAt, readCount, likeCount, hotScore).run();
  return { title: decodeHtml(title), sourceName: source?.name ?? detectedSource, hotScore };
}

export async function listRecommendations() {
  await ensureRadarSchema();
  const result = await getRuntimeEnv().DB.prepare("SELECT * FROM content_recommendations ORDER BY created_at DESC LIMIT 30").all();
  return result.results.map((row) => ({
    ...row,
    outline: safeJson(String(row.outline_json), []),
    keywords: safeJson(String(row.keywords_json), []),
    sourceArticleIds: safeJson(String(row.source_article_ids_json), []),
  }));
}

export async function saveRecommendations(items: Array<{ title: string; angle: string; audience: string; outline: string[]; keywords: string[]; predictedScore: number }>, sourceArticleIds: string[]) {
  await ensureRadarSchema();
  const { DB } = getRuntimeEnv();
  await DB.batch(items.map((item) => DB.prepare(`INSERT INTO content_recommendations (
    id, title, angle, audience, outline_json, keywords_json, predicted_score, source_article_ids_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), item.title, item.angle, item.audience, JSON.stringify(item.outline), JSON.stringify(item.keywords), item.predictedScore, JSON.stringify(sourceArticleIds))));
}

export async function getRecommendation(id: string) {
  await ensureRadarSchema();
  const row = await getRuntimeEnv().DB.prepare("SELECT * FROM content_recommendations WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  return { ...row, outline: safeJson(String(row.outline_json), []), keywords: safeJson(String(row.keywords_json), []) };
}

function validateWechatArticleUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== "mp.weixin.qq.com") throw new Error("unsupported host");
    return url.href;
  } catch {
    throw new WechatApiError(-1100, "请输入完整的 mp.weixin.qq.com 文章链接");
  }
}

function readMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"))?.[1]
    ?? "";
}

function readTag(html: string, tag: string) {
  return html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim() ?? "";
}

function readScriptValue(html: string, key: string) {
  return decodeHtml(html.match(new RegExp(`${key}\\s*[:=]\\s*["']([^"']+)["']`, "i"))?.[1] ?? "");
}

function readPublishTime(html: string) {
  const seconds = Number(html.match(/(?:publish_time|ct)\s*[:=]\s*["']?(\d{10})/)?.[1] ?? 0);
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function extractArticleText(html: string) {
  const content = html.match(/<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>\s*<script/i)?.[1]
    ?? html.match(/<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    ?? "";
  return decodeHtml(content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>|<\/section>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function decodeHtml(value: string) {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|\w+);/gi, (_, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1].toLowerCase() === "x";
      return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return entities[entity.toLowerCase()] ?? `&${entity};`;
  });
}

function calculateHotScore(input: { readCount: number; likeCount: number; publishedAt: string | null; textLength: number }) {
  const reads = input.readCount ? Math.min(24, Math.log10(input.readCount + 1) * 5) : 8;
  const likes = input.likeCount ? Math.min(16, Math.log10(input.likeCount + 1) * 4) : 5;
  const ageDays = input.publishedAt ? Math.max(0, (Date.now() - new Date(input.publishedAt).getTime()) / 86400000) : 14;
  const recency = Math.max(0, 20 - ageDays * 0.7);
  const depth = Math.min(10, input.textLength / 500);
  return Math.max(1, Math.min(99, Math.round(30 + reads + likes + recency + depth)));
}

function safeJson(value: string, fallback: unknown) {
  try { return JSON.parse(value); } catch { return fallback; }
}
