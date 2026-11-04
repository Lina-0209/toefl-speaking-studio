import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  title: text("title").notNull(),
  prompts: text("prompts").notNull().default("[]"),
  images: text("images").notNull().default("[]"),
  audio: text("audio").notNull().default("[]"),
  results: text("results").notNull().default("[]"),
  band: real("band"),
  bandNote: text("band_note"),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
});

export const providerCredentials = sqliteTable("provider_credentials", {
  ownerId: text("owner_id").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  models: text("models").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const studyMaterials = sqliteTable("study_materials", {
  ownerId: text("owner_id").primaryKey(),
  content: text("content").notNull(),
  updatedAt: text("updated_at").notNull(),
});
