import { sqliteTable, integer, text, unique } from "drizzle-orm/sqlite-core";
import { species, forms } from "./reference";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  gender: text("gender"),
  avatarKey: text("avatar_key"),
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

/**
 * One row per (user, ribbonId) the user has ever earned. `earnedAt` is set
 * once, on first earn, and never overwritten. `seenAt` starts `null` — a
 * freshly-earned ribbon is "newly earned" (see `newlyEarned` in the API
 * response) until `POST /api/ribbons/seen` bumps `seenAt`.
 */
export const userRibbons = sqliteTable(
  "user_ribbons",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    ribbonId: text("ribbon_id").notNull(),
    earnedAt: integer("earned_at").notNull(),
    seenAt: integer("seen_at"),
  },
  (t) => [unique("user_ribbons_user_id_ribbon_id_unique").on(t.userId, t.ribbonId)],
);

/**
 * Up to 6 ribbons a user has pinned to their showcase ("trophy wall"), keyed
 * by slot (0..5). Membership (a ribbon must be earned to be pinned) is
 * validated in the route against `userRibbons`, not enforceable at the
 * schema level since the ribbon catalog itself is computed, not stored.
 */
export const userShowcase = sqliteTable(
  "user_showcase",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    ribbonId: text("ribbon_id").notNull(),
    slot: integer("slot").notNull(),
  },
  (t) => [
    unique("user_showcase_user_id_slot_unique").on(t.userId, t.slot),
    unique("user_showcase_user_id_ribbon_id_unique").on(t.userId, t.ribbonId),
  ],
);

/**
 * Up to 3 species a user has pinned as their "top 3 favorites" for their
 * trainer card / public profile (Phase F shows these publicly), keyed by
 * slot (0..2) — same shape and same validation posture as `userShowcase`:
 * membership (the species must exist) is checked in the store function
 * against the `species` table, not enforceable purely at the schema level
 * beyond the FK itself.
 */
export const userFavorites = sqliteTable(
  "user_favorites",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    speciesId: integer("species_id").notNull().references(() => species.id),
    slot: integer("slot").notNull(),
  },
  (t) => [
    unique("user_favorites_user_id_slot_unique").on(t.userId, t.slot),
    unique("user_favorites_user_id_species_id_unique").on(t.userId, t.speciesId),
  ],
);
