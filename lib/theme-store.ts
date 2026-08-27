import { getRuntimeEnv, WechatApiError } from "@/lib/wechat";
import { isPresetThemeId, normalizeArticleTheme, type ArticleTheme } from "@/lib/themes";

type ThemeRow = {
  id: string;
  name: string;
  tag: string;
  description: string;
  config_json: string;
  created_at: string;
  updated_at: string;
};

const ACTIVE_THEME_KEY = "active_article_theme_id";

export async function ensureThemeSchema() {
  const { DB } = getRuntimeEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS custom_themes (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      tag TEXT NOT NULL DEFAULT '自定义',
      description TEXT NOT NULL DEFAULT '',
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_custom_themes_updated_at ON custom_themes(updated_at)"),
  ]);
  await DB.prepare("PRAGMA optimize").run();
}

export async function getThemeLibrary() {
  await ensureThemeSchema();
  const { DB } = getRuntimeEnv();
  const [rows, setting] = await Promise.all([
    DB.prepare("SELECT * FROM custom_themes ORDER BY updated_at DESC").all<ThemeRow>(),
    DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(ACTIVE_THEME_KEY).first<{ value: string }>(),
  ]);
  const customThemes = rows.results.map(themeFromRow).filter((theme): theme is ArticleTheme => Boolean(theme));
  const requestedActiveId = setting?.value ?? "minimal";
  const activeThemeId = isPresetThemeId(requestedActiveId) || customThemes.some((theme) => theme.id === requestedActiveId)
    ? requestedActiveId
    : "minimal";
  return { customThemes, activeThemeId };
}

export async function saveCustomTheme(input: unknown) {
  await ensureThemeSchema();
  const candidate = normalizeArticleTheme(input);
  const id = candidate.id || `custom-${crypto.randomUUID()}`;
  if (isPresetThemeId(id)) throw new WechatApiError(-1201, "不能覆盖系统预设主题");
  const theme = normalizeArticleTheme(candidate, id);
  await getRuntimeEnv().DB.prepare(`INSERT INTO custom_themes (
    id, name, tag, description, config_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    tag = excluded.tag,
    description = excluded.description,
    config_json = excluded.config_json,
    updated_at = CURRENT_TIMESTAMP`).bind(
      theme.id,
      theme.name,
      theme.tag,
      theme.desc,
      JSON.stringify(theme),
    ).run();
  return theme;
}

export async function setActiveTheme(themeId: string) {
  await ensureThemeSchema();
  const { DB } = getRuntimeEnv();
  if (!isPresetThemeId(themeId)) {
    const exists = await DB.prepare("SELECT id FROM custom_themes WHERE id = ?").bind(themeId).first<{ id: string }>();
    if (!exists) throw new WechatApiError(-1202, "主题不存在或已被删除");
  }
  await DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
    .bind(ACTIVE_THEME_KEY, themeId).run();
  return themeId;
}

export async function deleteCustomTheme(themeId: string) {
  await ensureThemeSchema();
  if (!themeId || isPresetThemeId(themeId)) throw new WechatApiError(-1203, "系统预设主题不能删除");
  const { DB } = getRuntimeEnv();
  const active = await DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(ACTIVE_THEME_KEY).first<{ value: string }>();
  await DB.prepare("DELETE FROM custom_themes WHERE id = ?").bind(themeId).run();
  if (active?.value === themeId) await setActiveTheme("minimal");
}

function themeFromRow(row: ThemeRow) {
  try {
    return normalizeArticleTheme({ ...JSON.parse(row.config_json), name: row.name, tag: row.tag, desc: row.description }, row.id);
  } catch {
    return null;
  }
}
