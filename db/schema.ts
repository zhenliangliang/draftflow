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
