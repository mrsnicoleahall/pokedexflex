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
// The Bulbapedia wikitext scrape (scripts/fetch-events.ts) leaves some raw
// HTML behind (mostly stray `<br>` / `<br/>` line breaks from source tables)
// and, potentially, HTML entities. Free-text columns get cleaned before
// insertion: strip tags, decode the handful of entities MediaWiki commonly
// emits, collapse whitespace runs (tags/entities often leave gaps behind),
// and trim. Unicode/full-width characters are left untouched -- they're
// legitimate content for Japanese-region events.
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&#39;": "'",
  "&quot;": '"',
};

function sanitizeText(v: string | null): string | null {
  if (v === null) return null;
  let s = v.replace(/<[^>]+>/g, " "); // strip HTML tags, e.g. <br>, <br/>
  s = s.replace(/&amp;|&lt;|&gt;|&#39;|&quot;/g, (m) => HTML_ENTITIES[m]);
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
        q(e.otId), // otId is NOT sanitized -- it's an opaque ID, not display text.
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
