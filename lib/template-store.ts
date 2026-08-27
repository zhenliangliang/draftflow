import { getRuntimeEnv, WechatApiError } from "@/lib/wechat";
import { normalizeArticleTemplate, type ArticleTemplate } from "@/lib/templates";

type TemplateRow = {
  id: string;
  name: string;
  description: string;
  header_markdown: string;
  footer_markdown: string;
  qr_code_url: string;
  qr_caption: string;
  show_previous_article: number;
  previous_label: string;
  default_previous_title: string;
  default_previous_url: string;
  is_default: number;
  updated_at: string;
};

export async function ensureTemplateSchema() {
  const { DB } = getRuntimeEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS article_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      header_markdown TEXT NOT NULL DEFAULT '',
      footer_markdown TEXT NOT NULL DEFAULT '',
      qr_code_url TEXT NOT NULL DEFAULT '',
      qr_caption TEXT NOT NULL DEFAULT '',
      show_previous_article INTEGER NOT NULL DEFAULT 1,
      previous_label TEXT NOT NULL DEFAULT '上一篇文章',
      default_previous_title TEXT NOT NULL DEFAULT '',
      default_previous_url TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_article_templates_updated_at ON article_templates(updated_at)"),
  ]);
  await DB.prepare("PRAGMA optimize").run();
}

export async function listArticleTemplates() {
  await ensureTemplateSchema();
  const rows = await getRuntimeEnv().DB.prepare("SELECT * FROM article_templates ORDER BY is_default DESC, updated_at DESC").all<TemplateRow>();
  return rows.results.map(templateFromRow);
}

export async function saveArticleTemplate(input: unknown) {
  await ensureTemplateSchema();
  const candidate = normalizeArticleTemplate(input);
  const id = candidate.id || `template-${crypto.randomUUID()}`;
  const template = normalizeArticleTemplate(candidate, id);
  const { DB } = getRuntimeEnv();
  const statements = [];
  if (template.isDefault) statements.push(DB.prepare("UPDATE article_templates SET is_default = 0 WHERE is_default = 1"));
  statements.push(DB.prepare(`INSERT INTO article_templates (
    id, name, description, header_markdown, footer_markdown, qr_code_url, qr_caption,
    show_previous_article, previous_label, default_previous_title, default_previous_url, is_default, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    header_markdown = excluded.header_markdown,
    footer_markdown = excluded.footer_markdown,
    qr_code_url = excluded.qr_code_url,
    qr_caption = excluded.qr_caption,
    show_previous_article = excluded.show_previous_article,
    previous_label = excluded.previous_label,
    default_previous_title = excluded.default_previous_title,
    default_previous_url = excluded.default_previous_url,
    is_default = excluded.is_default,
    updated_at = CURRENT_TIMESTAMP`).bind(
      template.id,
      template.name,
      template.description,
      template.headerMarkdown,
      template.footerMarkdown,
      template.qrCodeUrl,
      template.qrCaption,
      template.showPreviousArticle ? 1 : 0,
      template.previousLabel,
      template.defaultPreviousTitle,
      template.defaultPreviousUrl,
      template.isDefault ? 1 : 0,
    ));
  await DB.batch(statements);
  return template;
}

export async function setDefaultArticleTemplate(templateId: string) {
  await ensureTemplateSchema();
  const { DB } = getRuntimeEnv();
  const exists = await DB.prepare("SELECT id FROM article_templates WHERE id = ?").bind(templateId).first<{ id: string }>();
  if (!exists) throw new WechatApiError(-1301, "模板不存在或已被删除");
  await DB.batch([
    DB.prepare("UPDATE article_templates SET is_default = 0 WHERE is_default = 1"),
    DB.prepare("UPDATE article_templates SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(templateId),
  ]);
  return templateId;
}

export async function clearDefaultArticleTemplate() {
  await ensureTemplateSchema();
  await getRuntimeEnv().DB.prepare("UPDATE article_templates SET is_default = 0 WHERE is_default = 1").run();
}

export async function deleteArticleTemplate(templateId: string) {
  await ensureTemplateSchema();
  if (!templateId) throw new WechatApiError(-1302, "请选择要删除的模板");
  await getRuntimeEnv().DB.prepare("DELETE FROM article_templates WHERE id = ?").bind(templateId).run();
}

function templateFromRow(row: TemplateRow): ArticleTemplate {
  return normalizeArticleTemplate({
    id: row.id,
    name: row.name,
    description: row.description,
    headerMarkdown: row.header_markdown,
    footerMarkdown: row.footer_markdown,
    qrCodeUrl: row.qr_code_url,
    qrCaption: row.qr_caption,
    showPreviousArticle: row.show_previous_article === 1,
    previousLabel: row.previous_label,
    defaultPreviousTitle: row.default_previous_title,
    defaultPreviousUrl: row.default_previous_url,
    isDefault: row.is_default === 1,
    updatedAt: row.updated_at,
  }, row.id);
}
