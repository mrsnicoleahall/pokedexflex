import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { species, forms } from "./reference";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: integer("created_at").notNull(),
});

export const boxes = sqliteTable("boxes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
});

export const specimens = sqliteTable("specimens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  speciesId: integer("species_id").notNull().references(() => species.id),
  formId: integer("form_id").references(() => forms.id),
  nickname: text("nickname"),
  level: integer("level"),
  isShiny: integer("is_shiny").notNull().default(0),
  gender: text("gender"),
  nature: text("nature"),
  ability: text("ability"),
  heldItem: text("held_item"),
  ball: text("ball"),
  otName: text("ot_name"),
  otId: text("ot_id"),
  metLocation: text("met_location"),
  metDate: text("met_date"),
  originGame: text("origin_game"),
  originEra: text("origin_era"),
  isEvent: integer("is_event").notNull().default(0),
  eventName: text("event_name"),
  ribbons: text("ribbons"),
  ivs: text("ivs"),
  evs: text("evs"),
  moves: text("moves"),
  notes: text("notes"),
  boxId: text("box_id").references(() => boxes.id),
  source: text("source").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const importJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  status: text("status").notNull(),
  rawFileKey: text("raw_file_key"),
  preview: text("preview"),
  createdAt: integer("created_at").notNull(),
});

export const loginTokens = sqliteTable("login_tokens", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  email: text("email").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});
