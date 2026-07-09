import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const species = sqliteTable("species", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  generation: integer("generation").notNull(),
  types: text("types").notNull(), // JSON array string
  spriteUrl: text("sprite_url"),
});

export const forms = sqliteTable("forms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  speciesId: integer("species_id")
    .notNull()
    .references(() => species.id),
  name: text("name").notNull(),
  formType: text("form_type").notNull(),
  spriteUrl: text("sprite_url"),
});
