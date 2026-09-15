import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const wechatAccounts = sqliteTable("wechat_accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  appId: text("app_id").notNull().unique(),
  appSecretCiphertext: text("app_secret_ciphertext").notNull(),
  appSecretIv: text("app_secret_iv").notNull(),
  defaultAuthor: text("default_author").notNull().default("编辑部"),
  accessTokenCiphertext: text("access_token_ciphertext"),
  accessTokenIv: text("access_token_iv"),
  tokenExpiresAt: integer("token_expires_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const syncRecords = sqliteTable(
  "sync_records",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    title: text("title").notNull(),
    draftMediaId: text("draft_media_id"),
    status: text("status").notNull(),
    errorCode: integer("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_sync_records_created_at").on(table.createdAt),
    index("idx_sync_records_account_id").on(table.accountId),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const customThemes = sqliteTable(
  "custom_themes",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    tag: text("tag").notNull().default("自定义"),
    description: text("description").notNull().default(""),
    configJson: text("config_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_custom_themes_updated_at").on(table.updatedAt)],
);

export const articleTemplates = sqliteTable(
  "article_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    headerMarkdown: text("header_markdown").notNull().default(""),
    footerMarkdown: text("footer_markdown").notNull().default(""),
    qrCodeUrl: text("qr_code_url").notNull().default(""),
    qrCaption: text("qr_caption").notNull().default(""),
    showPreviousArticle: integer("show_previous_article", { mode: "boolean" }).notNull().default(true),
    previousLabel: text("previous_label").notNull().default("上一篇文章"),
    defaultPreviousTitle: text("default_previous_title").notNull().default(""),
    defaultPreviousUrl: text("default_previous_url").notNull().default(""),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_article_templates_updated_at").on(table.updatedAt)],
);

export const aiSettings = sqliteTable("ai_settings", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().default("openai"),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyIv: text("api_key_iv").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const contentSources = sqliteTable("content_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull().default("wechat"),
  sourceUrl: text("source_url"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastCheckedAt: text("last_checked_at"),
});

export const radarArticles = sqliteTable(
  "radar_articles",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id"),
    sourceName: text("source_name").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull().unique(),
    digest: text("digest").notNull().default(""),
    contentExcerpt: text("content_excerpt").notNull().default(""),
    publishedAt: text("published_at"),
    readCount: integer("read_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    hotScore: integer("hot_score").notNull().default(60),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_radar_articles_hot_score").on(table.hotScore),
    index("idx_radar_articles_source_id").on(table.sourceId),
  ],
);

export const contentRecommendations = sqliteTable(
  "content_recommendations",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    angle: text("angle").notNull(),
    audience: text("audience").notNull(),
    outlineJson: text("outline_json").notNull(),
    keywordsJson: text("keywords_json").notNull(),
    predictedScore: integer("predicted_score").notNull().default(70),
    sourceArticleIdsJson: text("source_article_ids_json").notNull(),
    status: text("status").notNull().default("new"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_content_recommendations_created_at").on(table.createdAt)],
);

export const radarStyleProfiles = sqliteTable(
  "radar_style_profiles",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().unique(),
    sourceName: text("source_name").notNull(),
    summary: text("summary").notNull(),
    audience: text("audience").notNull(),
    contentFocusJson: text("content_focus_json").notNull(),
    toneJson: text("tone_json").notNull(),
    titlePatternsJson: text("title_patterns_json").notNull(),
    openingPatternsJson: text("opening_patterns_json").notNull(),
    structurePatternsJson: text("structure_patterns_json").notNull(),
    reasoningPatternsJson: text("reasoning_patterns_json").notNull(),
    languageTraitsJson: text("language_traits_json").notNull(),
    pacing: text("pacing").notNull(),
    endingPatternsJson: text("ending_patterns_json").notNull(),
    doRulesJson: text("do_rules_json").notNull(),
    avoidRulesJson: text("avoid_rules_json").notNull(),
    sampleArticleIdsJson: text("sample_article_ids_json").notNull(),
    sampleCount: integer("sample_count").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_radar_style_profiles_updated_at").on(table.updatedAt)],
);
