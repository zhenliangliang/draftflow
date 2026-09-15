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

export type RadarStyleProfile = {
  id: string;
  sourceId: string;
  sourceName: string;
  summary: string;
  audience: string;
  contentFocus: string[];
  tone: string[];
  titlePatterns: string[];
  openingPatterns: string[];
  structurePatterns: string[];
  reasoningPatterns: string[];
  languageTraits: string[];
  pacing: string;
  endingPatterns: string[];
  doRules: string[];
  avoidRules: string[];
  sampleArticleIds: string[];
  sampleCount: number;
  updatedAt: string;
};

export type StyleProfileInput = Omit<RadarStyleProfile, "id" | "sampleArticleIds" | "sampleCount" | "updatedAt">;

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
    DB.prepare(`CREATE TABLE IF NOT EXISTS radar_style_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      source_id TEXT NOT NULL UNIQUE,
      source_name TEXT NOT NULL,
      summary TEXT NOT NULL,
      audience TEXT NOT NULL,
      content_focus_json TEXT NOT NULL,
      tone_json TEXT NOT NULL,
      title_patterns_json TEXT NOT NULL,
      opening_patterns_json TEXT NOT NULL,
      structure_patterns_json TEXT NOT NULL,
      reasoning_patterns_json TEXT NOT NULL,
      language_traits_json TEXT NOT NULL,
      pacing TEXT NOT NULL,
      ending_patterns_json TEXT NOT NULL,
      do_rules_json TEXT NOT NULL,
      avoid_rules_json TEXT NOT NULL,
      sample_article_ids_json TEXT NOT NULL,
      sample_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_style_profiles_source_id ON radar_style_profiles(source_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_radar_style_profiles_updated_at ON radar_style_profiles(updated_at)"),
  ]);
  const orphaned = await DB.prepare(`SELECT DISTINCT source_name FROM radar_articles
    WHERE source_id IS NULL AND TRIM(source_name) <> '' LIMIT 100`).all<{ source_name: string }>();
  for (const row of orphaned.results) {
    const source = await resolveArticleSource(undefined, row.source_name);
    await DB.prepare("UPDATE radar_articles SET source_id = ? WHERE source_id IS NULL AND source_name = ?")
      .bind(source.id, row.source_name).run();
  }
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
  const detectedSource = decodeHtml(readScriptValue(html, "nickname") || readMeta(html, "og:article:author") || "微信公众号");
  const source = await resolveArticleSource(input.sourceId, detectedSource);
  if (!title) throw new WechatApiError(-1102, "没有识别到文章标题，请确认链接可以公开访问");

  const excerpt = extractArticleText(html).slice(0, 12000);
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
    .bind(id, source.id, source.name, decodeHtml(title), url, decodeHtml(digest), excerpt, publishedAt, readCount, likeCount, hotScore).run();
  return { title: decodeHtml(title), sourceName: source.name, sourceId: source.id, hotScore };
}

export async function listStyleProfiles(): Promise<RadarStyleProfile[]> {
  await ensureRadarSchema();
  const result = await getRuntimeEnv().DB.prepare("SELECT * FROM radar_style_profiles ORDER BY updated_at DESC").all<Record<string, unknown>>();
  return result.results.map(mapStyleProfile);
}

export async function getStyleProfile(id: string): Promise<RadarStyleProfile | null> {
  await ensureRadarSchema();
  if (!id) return null;
  const row = await getRuntimeEnv().DB.prepare("SELECT * FROM radar_style_profiles WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return row ? mapStyleProfile(row) : null;
}

export async function saveStyleProfile(profile: StyleProfileInput, sampleArticleIds: string[]) {
  await ensureRadarSchema();
  const id = crypto.randomUUID();
  await getRuntimeEnv().DB.prepare(`INSERT INTO radar_style_profiles (
    id, source_id, source_name, summary, audience, content_focus_json, tone_json,
    title_patterns_json, opening_patterns_json, structure_patterns_json,
    reasoning_patterns_json, language_traits_json, pacing, ending_patterns_json,
    do_rules_json, avoid_rules_json, sample_article_ids_json, sample_count, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(source_id) DO UPDATE SET
    source_name = excluded.source_name, summary = excluded.summary, audience = excluded.audience,
    content_focus_json = excluded.content_focus_json, tone_json = excluded.tone_json,
    title_patterns_json = excluded.title_patterns_json, opening_patterns_json = excluded.opening_patterns_json,
    structure_patterns_json = excluded.structure_patterns_json, reasoning_patterns_json = excluded.reasoning_patterns_json,
    language_traits_json = excluded.language_traits_json, pacing = excluded.pacing,
    ending_patterns_json = excluded.ending_patterns_json, do_rules_json = excluded.do_rules_json,
    avoid_rules_json = excluded.avoid_rules_json, sample_article_ids_json = excluded.sample_article_ids_json,
    sample_count = excluded.sample_count, updated_at = CURRENT_TIMESTAMP`)
    .bind(
      id,
      profile.sourceId,
      profile.sourceName,
      profile.summary,
      profile.audience,
      JSON.stringify(profile.contentFocus),
      JSON.stringify(profile.tone),
      JSON.stringify(profile.titlePatterns),
      JSON.stringify(profile.openingPatterns),
      JSON.stringify(profile.structurePatterns),
      JSON.stringify(profile.reasoningPatterns),
      JSON.stringify(profile.languageTraits),
      profile.pacing,
      JSON.stringify(profile.endingPatterns),
      JSON.stringify(profile.doRules),
      JSON.stringify(profile.avoidRules),
      JSON.stringify(sampleArticleIds),
      sampleArticleIds.length,
    ).run();
  const saved = await getRuntimeEnv().DB.prepare("SELECT * FROM radar_style_profiles WHERE source_id = ?").bind(profile.sourceId).first<Record<string, unknown>>();
  if (!saved) throw new WechatApiError(-1113, "写作风格画像保存失败");
  return mapStyleProfile(saved);
}

export function formatStyleProfileForPrompt(profile: RadarStyleProfile) {
  return [
    `来源：${profile.sourceName}`,
    `风格摘要：${profile.summary}`,
    `核心受众：${profile.audience}`,
    `内容重心：${profile.contentFocus.join("、")}`,
    `语气：${profile.tone.join("、")}`,
    `标题机制：${profile.titlePatterns.join("；")}`,
    `开场方式：${profile.openingPatterns.join("；")}`,
    `常用结构：${profile.structurePatterns.join("；")}`,
    `论证方式：${profile.reasoningPatterns.join("；")}`,
    `语言特征：${profile.languageTraits.join("；")}`,
    `行文节奏：${profile.pacing}`,
    `结尾方式：${profile.endingPatterns.join("；")}`,
    `建议迁移：${profile.doRules.join("；")}`,
    `必须避免：${profile.avoidRules.join("；")}`,
  ].join("\n");
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

async function resolveArticleSource(sourceId: string | undefined, detectedName: string) {
  const { DB } = getRuntimeEnv();
  if (sourceId) {
    const source = await DB.prepare("SELECT id, name FROM content_sources WHERE id = ?").bind(sourceId).first<{ id: string; name: string }>();
    if (!source) throw new WechatApiError(-1103, "所选公众号不存在，请重新选择");
    return source;
  }
  const name = detectedName.trim() || "微信公众号";
  const existing = await DB.prepare("SELECT id, name FROM content_sources WHERE source_type = 'wechat' AND name = ? ORDER BY created_at LIMIT 1")
    .bind(name).first<{ id: string; name: string }>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  await DB.prepare("INSERT INTO content_sources (id, name, source_type) VALUES (?, ?, 'wechat')").bind(id, name).run();
  return { id, name };
}

function mapStyleProfile(row: Record<string, unknown>): RadarStyleProfile {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    sourceName: String(row.source_name),
    summary: String(row.summary),
    audience: String(row.audience),
    contentFocus: safeStringArray(row.content_focus_json),
    tone: safeStringArray(row.tone_json),
    titlePatterns: safeStringArray(row.title_patterns_json),
    openingPatterns: safeStringArray(row.opening_patterns_json),
    structurePatterns: safeStringArray(row.structure_patterns_json),
    reasoningPatterns: safeStringArray(row.reasoning_patterns_json),
    languageTraits: safeStringArray(row.language_traits_json),
    pacing: String(row.pacing),
    endingPatterns: safeStringArray(row.ending_patterns_json),
    doRules: safeStringArray(row.do_rules_json),
    avoidRules: safeStringArray(row.avoid_rules_json),
    sampleArticleIds: safeStringArray(row.sample_article_ids_json),
    sampleCount: Number(row.sample_count) || 0,
    updatedAt: String(row.updated_at),
  };
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

function safeStringArray(value: unknown) {
  const parsed = safeJson(String(value ?? "[]"), []);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}
