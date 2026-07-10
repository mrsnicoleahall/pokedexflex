// scripts/fetch-pokeapi.ts
//
// Build-time Node script (NOT shipped to the Worker). Downloads species and
// forms reference data from the free PokéAPI (https://pokeapi.co/api/v2/)
// and writes a committed snapshot to data/pokeapi-snapshot.json so that
// seeding the D1 database is reproducible without re-hitting the network.
//
// Run with: npx tsx scripts/fetch-pokeapi.ts
//
// `classifyForm` is imported by tests/scripts/build-seed.test.ts, which is
// type-checked under tests/tsconfig.json (its own "types" array, scoped to
// the Worker/vitest-pool-workers runtime, does not include "node"). The
// triple-slash directive below guarantees Node ambient globals (process,
// fetch, etc.) resolve for THIS file no matter which project transitively
// pulls it in, without widening any other project's "types" option.
/// <reference types="node" />

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API_BASE = "https://pokeapi.co/api/v2";

// ---------------------------------------------------------------------------
// Types (mirrors the D1 `species` / `forms` tables from src/db/schema).
// ---------------------------------------------------------------------------

export type FormType = "regional" | "mega" | "gigantamax" | "alternate" | "gender" | "other";

export interface SpeciesRow {
  id: number;
  name: string;
  generation: number;
  types: string[];
  spriteUrl: string | null;
  homeId: number | null;
}

export interface FormRow {
  speciesId: number;
  name: string;
  formType: FormType;
  spriteUrl: string | null;
  homeId: number | null;
}

export interface Snapshot {
  species: SpeciesRow[];
  forms: FormRow[];
}

// ---------------------------------------------------------------------------
// classifyForm: pure, no I/O, exported for testing.
// ---------------------------------------------------------------------------

export function classifyForm(name: string): FormType {
  const n = name.toLowerCase();
  if (n.includes("mega")) return "mega";
  if (n.includes("gmax") || n.includes("gigantamax")) return "gigantamax";
  if (/-(alola|galar|hisui|paldea)/.test(n)) return "regional";
  if (/-(male|female)$/.test(n)) return "gender";
  if (n.includes("-")) return "alternate";
  return "other";
}

// ---------------------------------------------------------------------------
// Polite fetch helpers: small concurrency + delay (~5 req/s aggregate),
// with retry/backoff on failure.
// ---------------------------------------------------------------------------

const CONCURRENCY = 5;
const DELAY_MS_PER_WORKER = 1000; // 1 req/s per worker * 5 workers ~= 5 req/s
const MAX_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const backoffMs = 500 * 2 ** attempt;
        console.warn(`  retrying ${url} after error (attempt ${attempt + 1}/${MAX_RETRIES}): ${String(err)}`);
        await sleep(backoffMs);
      }
    }
  }
  throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES + 1} attempts: ${String(lastError)}`);
}

/**
 * Runs `worker(item)` over `items` using `concurrency` parallel workers, each
 * pausing `delayMs` between requests, so the aggregate request rate stays
 * polite (roughly `concurrency / (delayMs/1000)` req/s).
 */
async function politePool<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      await sleep(delayMs);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// PokéAPI response shapes (only the fields we use).
// ---------------------------------------------------------------------------

interface NamedApiResource {
  name: string;
  url: string;
}

interface PokemonSpeciesListResponse {
  count: number;
  next: string | null;
  results: NamedApiResource[];
}

interface PokemonSpeciesVariety {
  is_default: boolean;
  pokemon: NamedApiResource;
}

interface PokemonSpeciesDetail {
  id: number;
  name: string;
  generation: NamedApiResource;
  varieties: PokemonSpeciesVariety[];
}

interface PokemonDetail {
  id: number;
  name: string;
  types: { slot: number; type: NamedApiResource }[];
  sprites: { front_default: string | null };
}

const GENERATION_NAME_TO_NUMBER: Record<string, number> = {
  "generation-i": 1,
  "generation-ii": 2,
  "generation-iii": 3,
  "generation-iv": 4,
  "generation-v": 5,
  "generation-vi": 6,
  "generation-vii": 7,
  "generation-viii": 8,
  "generation-ix": 9,
};

function generationNumberFromName(name: string): number {
  const n = GENERATION_NAME_TO_NUMBER[name];
  if (n === undefined) {
    throw new Error(`Unknown generation name: ${name}`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// main(): fetch everything and write the snapshot.
// ---------------------------------------------------------------------------

async function fetchAllSpeciesStubs(): Promise<NamedApiResource[]> {
  const stubs: NamedApiResource[] = [];
  const pageSize = 100;
  const first = await fetchJson<PokemonSpeciesListResponse>(`${API_BASE}/pokemon-species?limit=${pageSize}&offset=0`);
  stubs.push(...first.results);
  const total = first.count;
  const offsets: number[] = [];
  for (let offset = pageSize; offset < total; offset += pageSize) {
    offsets.push(offset);
  }
  const pages = await politePool(offsets, CONCURRENCY, DELAY_MS_PER_WORKER, (offset) =>
    fetchJson<PokemonSpeciesListResponse>(`${API_BASE}/pokemon-species?limit=${pageSize}&offset=${offset}`),
  );
  for (const page of pages) {
    stubs.push(...page.results);
  }
  return stubs;
}

async function main(): Promise<void> {
  console.log("Fetching PokéAPI species list...");
  const speciesStubs = await fetchAllSpeciesStubs();
  console.log(`Found ${speciesStubs.length} species. Fetching details (this will take a while, ~5 req/s)...`);

  const species: SpeciesRow[] = [];
  const forms: FormRow[] = [];

  let completed = 0;
  await politePool(speciesStubs, CONCURRENCY, DELAY_MS_PER_WORKER, async (stub) => {
    const detail = await fetchJson<PokemonSpeciesDetail>(stub.url);
    const generation = generationNumberFromName(detail.generation.name);

    const defaultVariety = detail.varieties.find((v) => v.is_default) ?? detail.varieties[0];
    const extraVarieties = detail.varieties.filter((v) => v !== defaultVariety);

    // Default variety -> species row (types + sprite come from /pokemon).
    // homeId is the pokemon id backing the default variety's HOME render
    // (normally equal to the species id, but not guaranteed by the API).
    const defaultPokemon = await fetchJson<PokemonDetail>(defaultVariety.pokemon.url);
    species.push({
      id: detail.id,
      name: detail.name,
      generation,
      types: defaultPokemon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      spriteUrl: defaultPokemon.sprites.front_default ?? null,
      homeId: defaultPokemon.id ?? null,
    });

    // Non-default varieties -> forms (mega, gmax, regional, alternate, gender...).
    // homeId is that variety's own pokemon id, so the UI can request its own
    // HOME render; null only if the API ever omits an id (UI falls back to
    // the species sprite in that case).
    for (const variety of extraVarieties) {
      const formPokemon = await fetchJson<PokemonDetail>(variety.pokemon.url);
      forms.push({
        speciesId: detail.id,
        name: variety.pokemon.name,
        formType: classifyForm(variety.pokemon.name),
        spriteUrl: formPokemon.sprites.front_default ?? null,
        homeId: formPokemon.id ?? null,
      });
    }

    completed++;
    if (completed % 50 === 0 || completed === speciesStubs.length) {
      console.log(`  ...${completed}/${speciesStubs.length} species processed`);
    }
  });

  species.sort((a, b) => a.id - b.id);
  forms.sort((a, b) => a.speciesId - b.speciesId || a.name.localeCompare(b.name));

  const snapshot: Snapshot = { species, forms };

  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "pokeapi-snapshot.json");
  await writeFile(outPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(`Wrote ${species.length} species and ${forms.length} forms to ${outPath}`);
}

// Guard main() so importing this module (e.g. from tests) triggers no network
// calls. `import.meta.main` is the standard check on Node >= 20.19/22.12, but
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
