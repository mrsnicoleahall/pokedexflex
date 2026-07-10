import { sqliteTable, integer, text, unique } from "drizzle-orm/sqlite-core";

export const species = sqliteTable("species", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  generation: integer("generation").notNull(),
  types: text("types").notNull(), // JSON array string
  spriteUrl: text("sprite_url"),
  homeId: integer("home_id"),
});

export const forms = sqliteTable(
  "forms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    speciesId: integer("species_id")
      .notNull()
      .references(() => species.id),
    name: text("name").notNull(),
    formType: text("form_type").notNull(),
    spriteUrl: text("sprite_url"),
    homeId: integer("home_id"),
  },
  (t) => [unique("forms_species_id_name_unique").on(t.speciesId, t.name)],
);

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    speciesId: integer("species_id")
      .notNull()
      .references(() => species.id),
    formId: integer("form_id").references(() => forms.id),
    year: integer("year"),
    games: text("games"),
    region: text("region"),
    method: text("method"),
    otName: text("ot_name"),
    otId: text("ot_id"),
    ribbon: text("ribbon"),
    isShiny: integer("is_shiny").notNull().default(0),
    notes: text("notes"),
  },
  (t) => [unique("events_slug_unique").on(t.slug)],
);
