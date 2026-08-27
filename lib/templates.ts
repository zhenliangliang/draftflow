export type ArticleTemplate = {
  id: string;
  name: string;
  description: string;
  headerMarkdown: string;
  footerMarkdown: string;
  qrCodeUrl: string;
  qrCaption: string;
  showPreviousArticle: boolean;
  previousLabel: string;
  defaultPreviousTitle: string;
  defaultPreviousUrl: string;
  isDefault: boolean;
  updatedAt?: string;
};

export function createArticleTemplateDraft(): ArticleTemplate {
  return {
    id: "",
    name: "公众号标准模板",
    description: "固定结尾、延伸阅读与关注二维码",
    headerMarkdown: "",
    footerMarkdown: "> 如果这篇文章对你有帮助，欢迎点赞、收藏并分享给需要的朋友。",
    qrCodeUrl: "",
    qrCaption: "扫码关注公众号，持续获取最新内容",
    showPreviousArticle: true,
    previousLabel: "上一篇文章",
    defaultPreviousTitle: "",
    defaultPreviousUrl: "",
    isDefault: false,
  };
}

export function normalizeArticleTemplate(input: unknown, id = ""): ArticleTemplate {
  const value = input && typeof input === "object" ? input as Partial<ArticleTemplate> : {};
  return {
    id: safeId(id || value.id || ""),
    name: safeText(value.name, "公众号标准模板", 32),
    description: safeText(value.description, "可复用的公众号文章模板", 100),
    headerMarkdown: safeMarkdown(value.headerMarkdown, 5000),
    footerMarkdown: safeMarkdown(value.footerMarkdown, 5000),
    qrCodeUrl: safeUrl(value.qrCodeUrl),
    qrCaption: safeText(value.qrCaption, "扫码关注公众号，持续获取最新内容", 80),
    showPreviousArticle: value.showPreviousArticle !== false,
    previousLabel: safeText(value.previousLabel, "上一篇文章", 24),
    defaultPreviousTitle: safeText(value.defaultPreviousTitle, "", 80),
    defaultPreviousUrl: safeUrl(value.defaultPreviousUrl),
    isDefault: value.isDefault === true,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

export function composeArticleWithTemplate(content: string, template: ArticleTemplate | null, variables: { previousTitle?: string; previousUrl?: string }) {
  if (!template) return content.trim();
  const parts: string[] = [];
  if (template.headerMarkdown.trim()) parts.push(template.headerMarkdown.trim());
  parts.push(content.trim());
  if (template.footerMarkdown.trim()) parts.push(template.footerMarkdown.trim());

  const previousTitle = variables.previousTitle?.trim() || template.defaultPreviousTitle;
  const previousUrl = safeUrl(variables.previousUrl) || template.defaultPreviousUrl;
  if (template.showPreviousArticle && previousTitle && previousUrl) {
    parts.push(`---\n\n### ${escapeMarkdown(template.previousLabel)}\n\n[${escapeMarkdown(previousTitle)}](${previousUrl})`);
  }
  if (template.qrCodeUrl) {
    parts.push(`---\n\n### 关注公众号\n\n![公众号关注二维码](${template.qrCodeUrl})\n\n${escapeMarkdown(template.qrCaption)}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

function safeText(value: unknown, fallback: string, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function safeMarkdown(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").slice(0, max) : "";
}

function safeId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : "";
}

function safeUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function escapeMarkdown(value: string) {
  return value.replace(/([\\`*_[\]{}()#+.!|>-])/g, "\\$1");
}
