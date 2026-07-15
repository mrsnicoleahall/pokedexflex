// scripts/build-events-seed.ts
//
// Build-time Node script (NOT shipped to the Worker). Reads the committed
// Bulbapedia event-distribution snapshot (data/events-snapshot.json,
// produced by scripts/fetch-events.ts) and generates idempotent
// `INSERT OR REPLACE` SQL statements for the `events` reference table,
// writing them to data/events-seed.sql for application via
// `wrangler d1 execute`.
//
// Run with: npx tsx scripts/build-events-seed.ts
//
/// <reference types="node" />

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { EventRow, EventsSnapshot } from "./fetch-events";

// ---------------------------------------------------------------------------
// SQL literal helpers (mirrors scripts/build-seed.ts).
// ---------------------------------------------------------------------------

const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null | undefined) => (v === null || v === undefined ? "NULL" : String(v));

// ---------------------------------------------------------------------------
// Text sanitization.
//
// The Bulbapedia wikitext scrape (scripts/fetch-events.ts) leaves several kinds
// of raw markup behind that must not reach the UI:
//   - stray HTML tags (`<br>`, `<code>`, ...) from source tables
//   - HTML entities MediaWiki emits (`&amp;`, `&nbsp;`, numeric, ...)
//   - MediaWiki file/image directives that got merged into the text, e.g.
//     "20px|link=Pokémon Champions Season M-1 Battle Pass Season M-1 Battle
//     Pass (Lv. 25)" -- an image thumbnail whose link target and a duplicated
//     label leaked into the visible string.
// Free-text columns get cleaned before insertion: strip the wiki markup, strip
// tags, decode entities, collapse the duplicated Battle Pass label and
// whitespace runs, then trim. Unicode/full-width characters are left untouched
// -- they're legitimate content for Japanese-region events.
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&#39;": "'",
  "&quot;": '"',
  "&nbsp;": " ",
};

// otId is shown in the UI but is an ID rather than prose, so it gets a lighter
// touch than sanitizeText: some rows carry several OT IDs the wiki table joined
// with `<br>`, which we turn into a readable "A / B / C" instead of stripping to
// a run-on. IDs without markup pass through unchanged.
function sanitizeId(v: string | null): string | null {
  if (v === null) return null;
  let s = v.replace(/<br\s*\/?>/gi, " / "); // multiple OT IDs were <br>-joined
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&amp;|&lt;|&gt;|&#39;|&quot;|&nbsp;/g, (m) => HTML_ENTITIES[m]);
  s = s.replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

function sanitizeText(v: string | null): string | null {
  if (v === null) return null;
  let s = v;
  // Drop leaked MediaWiki file/image markup ("<n>px|link=<target>") plus the
  // link target that got concatenated in front of the real label.
  s = s.replace(/\d+px\|link=Pok[eé]mon Champions\s*/gi, "");
  s = s.replace(/\[\[[^\]]*\]\]/g, " "); // any surviving [[...]] wiki links
  s = s.replace(/\d+px\|link=/gi, ""); // any other stray image directive
  s = s.replace(/<[^>]+>/g, " "); // strip HTML tags, e.g. <br>, <code>
  s = s.replace(/&amp;|&lt;|&gt;|&#39;|&quot;|&nbsp;/g, (m) => HTML_ENTITIES[m]);
  s = s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))); // numeric entities
  // Collapse the duplicated "Season M-N Battle Pass" label the source repeated.
  s = s.replace(/(Season M-\d+ Battle Pass)(?:\s+Season M-\d+ Battle Pass)+/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

// ---------------------------------------------------------------------------
// eventsToSql: pure, no I/O, exported for testing.
// ---------------------------------------------------------------------------

export function eventsToSql(events: EventRow[]): string {
  return events
    .map((e) => {
      const cols = [
        q(e.slug),
        q(sanitizeText(e.name)),
        n(e.speciesId),
        n(e.formId ?? null),
        n(e.year ?? null),
        q(sanitizeText(e.games)),
        q(sanitizeText(e.region)),
        q(sanitizeText(e.method)),
        q(sanitizeText(e.otName)),
        q(sanitizeId(e.otId)), // light-touch: turns <br>-joined multi-IDs into "A / B".
        q(sanitizeText(e.ribbon)),
        n(e.isShiny),
        q(sanitizeText(e.notes)),
      ].join(",");
      return (
        `INSERT OR REPLACE INTO events (slug,name,species_id,form_id,year,games,region,method,ot_name,ot_id,ribbon,is_shiny,notes) VALUES ` +
        `(${cols});`
      );
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// main(): read the snapshot and write data/events-seed.sql.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  const snapshotPath = path.join(dataDir, "events-snapshot.json");
  const raw = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(raw) as EventsSnapshot;

  const sql = eventsToSql(snapshot.events);

  const outPath = path.join(dataDir, "events-seed.sql");
  await writeFile(outPath, sql + "\n", "utf8");

  console.log(`Wrote ${snapshot.events.length} event INSERT OR REPLACE statements to ${outPath}`);
}

// Guard main() so importing this module (e.g. from tests) triggers no file
// I/O. See scripts/build-seed.ts for why this fallback exists (tsx does not
// populate import.meta.main as of v4.23.0).
function isRunAsEntryScript(): boolean {
  if (typeof import.meta.main === "boolean") {
    return import.meta.main;
  }
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isRunAsEntryScript()) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
