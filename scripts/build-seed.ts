// scripts/build-seed.ts
//
// Build-time Node script (NOT shipped to the Worker). Reads the committed
// PokéAPI snapshot (data/pokeapi-snapshot.json, produced by
// scripts/fetch-pokeapi.ts) and generates idempotent `INSERT OR REPLACE`
// SQL statements for the `species` and `forms` reference tables, writing
// them to data/seed.sql for application via `wrangler d1 execute`.
//
// Run with: npx tsx scripts/build-seed.ts
//
/// <reference types="node" />

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Types (mirrors the D1 `species` / `forms` tables from src/db/schema).
// ---------------------------------------------------------------------------

type Snapshot = {
  species: { id: number; name: string; generation: number; types: string[]; spriteUrl: string | null }[];
  forms: { speciesId: number; name: string; formType: string; spriteUrl: string | null }[];
};

// ---------------------------------------------------------------------------
// snapshotToSql: pure, no I/O, exported for testing.
// ---------------------------------------------------------------------------

const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);

export function snapshotToSql(s: Snapshot): string {
  const sp = s.species.map(
    (x) =>
      `INSERT OR REPLACE INTO species (id,name,generation,types,sprite_url) VALUES ` +
      `(${x.id},${q(x.name)},${x.generation},${q(JSON.stringify(x.types))},${q(x.spriteUrl)});`,
  );
  const fm = s.forms.map(
    (x) =>
      `INSERT OR REPLACE INTO forms (species_id,name,form_type,sprite_url) VALUES ` +
      `(${x.speciesId},${q(x.name)},${q(x.formType)},${q(x.spriteUrl)});`,
  );
  return [...sp, ...fm].join("\n");
}

// ---------------------------------------------------------------------------
// main(): read the snapshot and write data/seed.sql.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  const snapshotPath = path.join(dataDir, "pokeapi-snapshot.json");
  const raw = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(raw) as Snapshot;

  const sql = snapshotToSql(snapshot);

  const outPath = path.join(dataDir, "seed.sql");
  await writeFile(outPath, sql + "\n", "utf8");

  console.log(
    `Wrote ${snapshot.species.length} species and ${snapshot.forms.length} form INSERT OR REPLACE statements to ${outPath}`,
  );
}

// Guard main() so importing this module (e.g. from tests) triggers no file
// I/O. `import.meta.main` is the standard check on Node >= 20.19/22.12, but
// tsx (as of v4.23.0) does not populate it, so we fall back to comparing
// `import.meta.url` against the CLI entry point (`process.argv[1]`) — the
// classic ESM "is this the entry module" check.
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
