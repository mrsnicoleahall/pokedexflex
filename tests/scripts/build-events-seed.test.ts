import { describe, it, expect } from "vitest";
import { eventsToSql } from "../../scripts/build-events-seed";
import type { EventRow } from "../../scripts/fetch-events";

const base: EventRow = {
  slug: "bulbasaur",
  name: "Bulbasaur — Event",
  speciesId: 1,
  formId: null,
  year: 2002,
  games: "Red/Blue/Yellow",
  region: null,
  method: null,
  otName: "STADIUM",
  otId: "02000",
  ribbon: null,
  isShiny: 0,
  notes: "Lv. 5",
  sourcePage: "List of game-based Pokémon distributions in Generation I",
};

describe("eventsToSql", () => {
  it("emits INSERT OR REPLACE INTO events with the slug present", () => {
    const sql = eventsToSql([base]);
    expect(sql).toContain("INSERT OR REPLACE INTO events");
    expect(sql).toContain("'bulbasaur'");
  });

  it("emits a bare NULL literal for null fields, never the string 'null'", () => {
    const sql = eventsToSql([base]);
    // region and method and ribbon and form_id are all null on `base`.
    expect(sql).toMatch(/,NULL,/);
    expect(sql).not.toContain("'null'");
  });

  it("escapes a single quote (apostrophe) in text values", () => {
    const row: EventRow = { ...base, otName: "Farfetch'd" };
    const sql = eventsToSql([row]);
    expect(sql).toContain("Farfetch''d");
    expect(sql).not.toContain("Farfetch'd'");
  });

  it("strips HTML tags like <br> out of sanitized text fields", () => {
    const row: EventRow = { ...base, otName: "<br>" };
    const sql = eventsToSql([row]);
    expect(sql).not.toContain("<br>");
  });

  it("strips HTML tags embedded within other text without losing surrounding words", () => {
    const row: EventRow = { ...base, notes: "Lv. 70<br/>Ability: Overgrow" };
    const sql = eventsToSql([row]);
    expect(sql).not.toContain("<br");
    expect(sql).toContain("Lv. 70");
    expect(sql).toContain("Ability: Overgrow");
  });

  it("decodes common HTML entities", () => {
    const row: EventRow = { ...base, notes: "Tom &amp; Jerry &lt;3 &quot;test&quot; &#39;quote&#39;" };
    const sql = eventsToSql([row]);
    // Decoded entities: & < " ' -- the trailing apostrophe is SQL-escaped (doubled).
    expect(sql).toContain('Tom & Jerry <3 "test" \'\'quote\'\'');
  });

  it("decodes &nbsp; to a space (password fields)", () => {
    const row: EventRow = { ...base, method: "Password: <code>B1G0&nbsp;006</code>" };
    const sql = eventsToSql([row]);
    expect(sql).toContain("Password: B1G0 006");
    expect(sql).not.toContain("&nbsp;");
    expect(sql).not.toContain("<code>");
  });

  it("strips leaked MediaWiki image markup and collapses the duplicated Battle Pass label", () => {
    const row: EventRow = {
      ...base,
      name: "Meganium — 20px|link=Pokémon Champions Season M-1 Battle Pass Season M-1 Battle Pass (Lv. 25)",
      method: "20px|link=Pokémon Champions Season M-1 Battle Pass Season M-1 Battle Pass (Lv. 25)",
    };
    const sql = eventsToSql([row]);
    expect(sql).toContain("Meganium — Season M-1 Battle Pass (Lv. 25)");
    expect(sql).not.toContain("20px|");
    expect(sql).not.toContain("link=");
    // the duplicated label is collapsed to a single occurrence
    expect(sql).not.toMatch(/Battle Pass Season M-1 Battle Pass/);
  });

  it("leaves a plain otId unchanged (apart from SQL-escaping)", () => {
    const row: EventRow = { ...base, otId: "(Hatcher's)" };
    const sql = eventsToSql([row]);
    expect(sql).toContain("(Hatcher''s)");
  });

  it("turns <br>-joined multi-value otIds into a readable 'A / B / C'", () => {
    const row: EventRow = { ...base, otId: "10123<br/>10014<br/>10015" };
    const sql = eventsToSql([row]);
    expect(sql).toContain("10123 / 10014 / 10015");
    expect(sql).not.toContain("<br");
  });

  it("emits all 13 columns in the documented order, with no id column", () => {
    const sql = eventsToSql([base]);
    expect(sql).toContain(
      "INSERT OR REPLACE INTO events (slug,name,species_id,form_id,year,games,region,method,ot_name,ot_id,ribbon,is_shiny,notes) VALUES",
    );
  });
});
