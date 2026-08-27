export type HeadingStyle = "bar" | "underline" | "plain";
export type QuoteStyle = "tint" | "line" | "card";
export type CodeStyle = "dark" | "light";
export type TableStyle = "grid" | "soft";

export type ArticleTheme = {
  id: string;
  name: string;
  tag: string;
  desc: string;
  color: string;
  bg: string;
  textColor: string;
  bodyFontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  headingStyle: HeadingStyle;
  quoteStyle: QuoteStyle;
  codeStyle: CodeStyle;
  tableStyle: TableStyle;
  isCustom: boolean;
};

export const presetThemes: ArticleTheme[] = [
  { id: "minimal", name: "极简绿", tag: "默认", color: "#174d3a", bg: "#f7fbf5", textColor: "#3f4943", desc: "克制、清晰，适合技术与商业内容", bodyFontSize: 14, lineHeight: 1.8, paragraphSpacing: 14, headingStyle: "bar", quoteStyle: "tint", codeStyle: "dark", tableStyle: "soft", isCustom: false },
  { id: "paper", name: "纸间白", tag: "阅读友好", color: "#745d43", bg: "#fbf7ef", textColor: "#4d463f", desc: "温暖纸张质感，适合长篇阅读", bodyFontSize: 14, lineHeight: 1.9, paragraphSpacing: 16, headingStyle: "underline", quoteStyle: "line", codeStyle: "light", tableStyle: "soft", isCustom: false },
  { id: "ink", name: "墨色", tag: "专业", color: "#20272b", bg: "#f2f3f3", textColor: "#30383c", desc: "高对比黑白，强调观点和结构", bodyFontSize: 14, lineHeight: 1.75, paragraphSpacing: 13, headingStyle: "plain", quoteStyle: "card", codeStyle: "dark", tableStyle: "grid", isCustom: false },
  { id: "tech", name: "科技蓝", tag: "理性", color: "#285d87", bg: "#f0f7fb", textColor: "#344b5c", desc: "冷静理性，适合数据与产品内容", bodyFontSize: 14, lineHeight: 1.8, paragraphSpacing: 14, headingStyle: "bar", quoteStyle: "tint", codeStyle: "dark", tableStyle: "grid", isCustom: false },
  { id: "sunset", name: "暖橙", tag: "活力", color: "#a14f2a", bg: "#fff5ed", textColor: "#57453b", desc: "醒目有温度，适合品牌和活动内容", bodyFontSize: 14, lineHeight: 1.85, paragraphSpacing: 16, headingStyle: "underline", quoteStyle: "card", codeStyle: "light", tableStyle: "soft", isCustom: false },
  { id: "editorial", name: "编辑部", tag: "杂志感", color: "#6b3150", bg: "#faf2f6", textColor: "#4f4048", desc: "更强的视觉节奏和栏目感", bodyFontSize: 14, lineHeight: 1.8, paragraphSpacing: 15, headingStyle: "plain", quoteStyle: "line", codeStyle: "dark", tableStyle: "grid", isCustom: false },
];

export const defaultTheme = presetThemes[0];

export function isPresetThemeId(id: string) {
  return presetThemes.some((theme) => theme.id === id);
}

export function createCustomThemeDraft(base: ArticleTheme = defaultTheme): ArticleTheme {
  return {
    ...base,
    id: "",
    name: base.isCustom ? `${base.name} 副本` : "我的主题",
    tag: "自定义",
    desc: "为公众号文章定制的专属排版主题",
    isCustom: true,
  };
}

export function normalizeArticleTheme(input: unknown, id = ""): ArticleTheme {
  const value = input && typeof input === "object" ? input as Partial<ArticleTheme> : {};
  return {
    id: safeId(id || value.id || ""),
    name: safeText(value.name, "我的主题", 24),
    tag: safeText(value.tag, "自定义", 12),
    desc: safeText(value.desc, "为公众号文章定制的专属排版主题", 80),
    color: safeHex(value.color, defaultTheme.color),
    bg: safeHex(value.bg, defaultTheme.bg),
    textColor: safeHex(value.textColor, defaultTheme.textColor),
    bodyFontSize: clampNumber(value.bodyFontSize, 13, 18, 14),
    lineHeight: clampNumber(value.lineHeight, 1.5, 2.2, 1.8),
    paragraphSpacing: clampNumber(value.paragraphSpacing, 8, 24, 14),
    headingStyle: oneOf(value.headingStyle, ["bar", "underline", "plain"], "bar"),
    quoteStyle: oneOf(value.quoteStyle, ["tint", "line", "card"], "tint"),
    codeStyle: oneOf(value.codeStyle, ["dark", "light"], "dark"),
    tableStyle: oneOf(value.tableStyle, ["grid", "soft"], "soft"),
    isCustom: true,
  };
}

function safeText(value: unknown, fallback: string, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function safeId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : "";
}

function safeHex(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}
