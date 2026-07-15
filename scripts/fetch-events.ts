// scripts/fetch-events.ts
//
// Build-time Node script (NOT shipped to the Worker). Scrapes the Bulbapedia
// "event Pokémon distribution" directory (MediaWiki API) into a normalized,
// committed snapshot at data/events-snapshot.json, so PokeDexFlex can browse
// historical Mystery Gift / event distributions without re-scraping.
//
// Data source: Bulbapedia (https://bulbapedia.bulbagarden.net), text content
// licensed CC BY-NC-SA. Fetched politely via the MediaWiki API (action=parse),
// never by scraping rendered HTML.
//
// Run with: npx tsx scripts/fetch-events.ts
//
/// <reference types="node" />

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API_BASE = "https://bulbapedia.bulbagarden.net/w/api.php";
const USER_AGENT = "PokeDexFlex/0.1 (personal Pokedex project; contact NicoleHall@attorneyassistant.com)";

// ---------------------------------------------------------------------------
// Target schema
// ---------------------------------------------------------------------------

export interface EventRow {
  slug: string;
  name: string;
  speciesId: number;
  formId: null;
  year: number | null;
  games: string | null;
  region: string | null;
  method: string | null;
  otName: string | null;
  otId: string | null;
  ribbon: string | null;
  isShiny: 0 | 1;
  notes: string | null;
  sourcePage: string;
}

export interface EventsSnapshot {
  _note: string;
  _source: string;
  events: EventRow[];
}

// ---------------------------------------------------------------------------
// Wikitext template parsing primitives (pure, no I/O).
// ---------------------------------------------------------------------------

/** A single top-level `{{...}}` template invocation found in wikitext. */
export interface TemplateMatch {
  name: string;
  args: string; // raw text after the first top-level "|", i.e. everything but the name
  start: number;
  end: number; // exclusive, points just past the closing "}}"
}

/**
 * Splits `s` on top-level "|" characters, treating "{{...}}" and "[[...]]"
 * spans as opaque (their internal "|" don't count as separators). Used both
 * to split a template's name from its args and to split args into params.
 */
export function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      cur += two;
      i++;
      continue;
    }
    if (two === "}}" || two === "]]") {
      depth = Math.max(0, depth - 1);
      cur += two;
      i++;
      continue;
    }
    if (s[i] === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += s[i];
  }
  parts.push(cur);
  return parts;
}

/**
 * Scans `text` for top-level (non-nested) `{{...}}` template invocations,
 * in document order. Templates nested inside another template's params are
 * NOT returned separately (they remain part of that outer template's `args`
 * string) -- this is intentional: it lets the caller run a simple state
 * machine over "head"/"entry"/"footer" style event templates without nested
 * decoration templates (e.g. `{{tt|...}}`) confusing the sequence.
 */
export function extractTopLevelTemplates(text: string): TemplateMatch[] {
  const results: TemplateMatch[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{" && text[i + 1] === "{") {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === "{" && text[j + 1] === "{") {
          depth++;
          j += 2;
        } else if (text[j] === "}" && text[j + 1] === "}") {
          depth--;
          j += 2;
        } else {
          j++;
        }
      }
      const inner = text.slice(i + 2, Math.max(i + 2, j - 2));
      const parts = splitTopLevel(inner);
      const name = (parts[0] ?? "").trim();
      const args = parts.slice(1).join("|");
      if (name) {
        results.push({ name, args, start: i, end: j });
      }
      i = j;
    } else {
      i++;
    }
  }
  return results;
}

export interface ParsedParams {
  kv: Record<string, string>;
  positional: string[];
}

/** Parses a template's `args` string into named (`key=value`) and positional params. */
export function parseTemplateArgs(args: string): ParsedParams {
  const kv: Record<string, string> = {};
  const positional: string[] = [];
  if (!args) return { kv, positional };
  for (const rawPart of splitTopLevel(args)) {
    const m = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=([\s\S]*)$/.exec(rawPart);
    if (m) {
      kv[m[1].toLowerCase()] = m[2].trim();
    } else {
      const trimmed = rawPart.trim();
      if (trimmed.length > 0) positional.push(trimmed);
    }
  }
  return { kv, positional };
}

/** Strips HTML comments and <ref>...</ref> bodies (citations add no event data). */
export function stripCommentsAndRefs(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
}

const INLINE_TEMPLATE_DISPLAY_INDEX: Record<string, number> = {
  // template name (lowercase) -> which positional arg (0-based) holds display text
  p: 0,
  pkmn: 0,
  m: 0,
  mv: 0,
  dl: 1,
  wp: 1,
  jwp: 1,
  tt: 0,
  tt2: 0,
  jpn: 1,
  obp: 0,
  v2: 0,
  rf: 0,
  g: 0,
  sup: 0,
};

/**
 * Reduces a raw wikitext fragment to plain(ish) display text: resolves
 * `[[link|display]]` / `[[link]]`, unwraps common inline templates
 * (`{{p|Mew}}` -> "Mew", `{{DL|page|display}}` -> "display", etc.), drops
 * anything else it doesn't recognize, and collapses whitespace. Best-effort
 * -- Bulbapedia wikitext has many long-tail templates this won't unwrap.
 */
export function cleanWikitext(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  let s = stripCommentsAndRefs(raw);

  // Wiki links: [[a|b]] -> b ; [[a]] -> a. Applied a few times to handle
  // simple nesting inside piped links.
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(/\[\[([^[\]|]*)\|([^[\]]*)\]\]/g, "$2").replace(/\[\[([^[\]]*)\]\]/g, "$1");
    if (s === before) break;
  }

  // Unwrap/strip templates, innermost-out, a few passes.
  for (let iter = 0; iter < 5; iter++) {
    const tmpls = extractTopLevelTemplates(s);
    if (tmpls.length === 0) break;
    for (let k = tmpls.length - 1; k >= 0; k--) {
      const t = tmpls[k];
      const nameLower = t.name.trim().toLowerCase();
      const positional = splitTopLevel(t.args).map((p) => p.trim());
      let replacement = "";
      if (nameLower in INLINE_TEMPLATE_DISPLAY_INDEX) {
        const idx = INLINE_TEMPLATE_DISPLAY_INDEX[nameLower];
        replacement = positional[idx] || positional[0] || "";
      }
      s = s.slice(0, t.start) + replacement + s.slice(t.end);
    }
  }

  s = s.replace(/'{2,3}/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

// ---------------------------------------------------------------------------
// Species-name normalization / resolution against data/pokeapi-snapshot.json
// ---------------------------------------------------------------------------

/** Converts a Bulbapedia-style display name to PokéAPI's slug convention. */
export function toPokeApiSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (é -> e)
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/[.':]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const FORM_PREFIX_RE = /^(alolan|galarian|hisuian|paldean|kantonian|mega|primal|origin|therian|incarnate|shiny)\s+/i;

/** Strips regional/form qualifiers so a form name resolves to its base species. */
export function baseSpeciesNameForLookup(name: string): string {
  let s = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  s = s.replace(FORM_PREFIX_RE, "");
  return s;
}

export interface SpeciesResolver {
  resolve(speciesText: string, ndex: string | undefined): number | null;
}

export function buildSpeciesResolver(snapshot: { species: { id: number; name: string }[] }): SpeciesResolver {
  const idSet = new Set(snapshot.species.map((s) => s.id));
  const nameToId = new Map(snapshot.species.map((s) => [s.name, s.id]));
  return {
    resolve(speciesText: string, ndex: string | undefined): number | null {
      if (ndex) {
        const n = Number.parseInt(ndex, 10);
        if (Number.isFinite(n) && idSet.has(n)) return n;
      }
      const cleaned = cleanWikitext(speciesText);
      if (!cleaned) return null;
      const slug = toPokeApiSlug(baseSpeciesNameForLookup(cleaned));
      if (nameToId.has(slug)) return nameToId.get(slug)!;
      // second try: full text without stripping form prefixes, in case the
      // qualifier is actually part of the canonical PokeAPI name (rare).
      const fullSlug = toPokeApiSlug(cleaned);
      return nameToId.get(fullSlug) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Region / games / year derivation
// ---------------------------------------------------------------------------

const REGION_KEYWORDS: [RegExp, string][] = [
  [/japanese/i, "Japan"],
  [/american/i, "American"],
  [/\bkorean\b/i, "Korea"],
  [/taiwanese/i, "Taiwan"],
  [/mainland china/i, "Mainland China"],
  [/\bpal\b/i, "PAL"],
  [/european/i, "Europe"],
  [/\bgerman\b/i, "Germany"],
  [/\bfrench\b/i, "France"],
  [/\bitalian\b/i, "Italy"],
  [/\bspanish\b/i, "Spain"],
  [/\benglish\b/i, "English"],
];

/** Derives a region string from the source page title, per the task's rule. */
export function deriveRegionFromTitle(title: string): string | null {
  for (const [re, label] of REGION_KEYWORDS) {
    if (re.test(title)) return label;
  }
  return null;
}

const GAME_LABELS: Record<string, string> = {
  swsh: "Sword/Shield",
  sw: "Sword",
  sh: "Shield",
  sword: "Sword",
  shield: "Shield",
  bdsp: "Brilliant Diamond/Shining Pearl",
  bd: "Brilliant Diamond",
  sp: "Shining Pearl",
  la: "Legends: Arceus",
  pla: "Legends: Arceus",
  lza: "Legends: Z-A",
  sv: "Scarlet/Violet",
  s: "Scarlet",
  v: "Violet",
  scarlet: "Scarlet",
  violet: "Violet",
  lgpe: "Let's Go Pikachu/Let's Go Eevee",
  lgp: "Let's Go Pikachu",
  lge: "Let's Go Eevee",
  sm: "Sun/Moon",
  usum: "Ultra Sun/Ultra Moon",
  sun: "Sun",
  moon: "Moon",
  us: "Ultra Sun",
  um: "Ultra Moon",
  oras: "Omega Ruby/Alpha Sapphire",
  or: "Omega Ruby",
  as: "Alpha Sapphire",
  xy: "X/Y",
  x: "X",
  y: "Y",
  "1y": "Yellow",
  bw: "Black/White",
  bw2: "Black 2/White 2",
  b: "Black",
  w: "White",
  b2: "Black 2",
  w2: "White 2",
  dp: "Diamond/Pearl",
  "4d": "Diamond",
  "4p": "Pearl",
  pt: "Platinum",
  "4pt": "Platinum",
  hgss: "HeartGold/SoulSilver",
  hg: "HeartGold",
  ss: "SoulSilver",
  rs: "Ruby/Sapphire",
  e: "Emerald",
  frlg: "FireRed/LeafGreen",
  fr: "FireRed",
  lg: "LeafGreen",
  rb: "Red/Blue",
  gs: "Gold/Silver",
  c: "Crystal",
};

/** Maps a raw game code (e.g. "swsh", "4d", "oras") to a display label, or returns it unchanged. */
export function gameLabel(code: string): string {
  const key = code.trim().toLowerCase();
  return GAME_LABELS[key] ?? code.trim();
}

/** Extracts the first plausible 4-digit year (19xx/20xx) found in `text`. */
export function extractYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /\b(19|20)\d{2}\b/.exec(text);
  return m ? Number.parseInt(m[0], 10) : null;
}

// ---------------------------------------------------------------------------
// slug helper
// ---------------------------------------------------------------------------

export function slugifyPart(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeUniqueSlug(parts: (string | number | null | undefined)[], used: Set<string>): string {
  const base = slugifyPart(parts.filter((p) => p !== null && p !== undefined && p !== "").join("-")) || "event";
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  used.add(slug);
  return slug;
}

// ---------------------------------------------------------------------------
// Trailing-wikitable summarizer (collapses location/date sub-tables to notes)
// ---------------------------------------------------------------------------

export function summarizeTrailingTable(tailText: string): string | null {
  const m = /\{\|[\s\S]*?\n\|\}/.exec(tailText);
  if (!m) return null;
  const tableText = m[0];
  const rowSeparators = (tableText.match(/\n\|-/g) || []).length;
  const rows = Math.max(rowSeparators - 1, 0); // approx: minus the header separator
  if (rows <= 0) return null;
  const dateMatch = /[A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?\s*(?:to|through|[-–])\s*[A-Za-z0-9,.\s]{0,25}\d{4}/.exec(
    tableText,
  );
  return `Distributed at ${rows} locations` + (dateMatch ? `, ${dateMatch[0]}` : "");
}

// ---------------------------------------------------------------------------
// Template-based event-block parser (primary, Gen IV+ style pages)
// ---------------------------------------------------------------------------

interface EntryInfo {
  game: string | null;
  method: string | null;
  date: string | null;
}

function parseEntryPositional(positional: string[]): EntryInfo {
  const filtered = positional.filter((p) => p.toLowerCase() !== "hide");
  if (filtered.length === 0) return { game: null, method: null, date: null };
  const game = filtered[0] ?? null;
  const method = filtered.length >= 2 ? filtered[1] : null;
  const date = filtered.length >= 3 ? filtered[filtered.length - 1] : filtered.length === 2 ? null : null;
  return { game, method, date };
}

interface HeadingEntry {
  offset: number;
  text: string;
}

function collectHeadings(text: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const re = /^(={2,6})\s*(.*?)\s*\1\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    headings.push({ offset: m.index, text: m[2] });
  }
  return headings;
}

function nearestHeading(headings: HeadingEntry[], offset: number): string | null {
  let best: string | null = null;
  for (const h of headings) {
    if (h.offset <= offset) best = h.text;
    else break;
  }
  return best;
}

const GAME_BOOL_FLAGS: [string, string][] = [
  ["red", "Red"],
  ["blue", "Blue"],
  ["green", "Green"],
  ["yellow", "Yellow"],
  ["gold", "Gold"],
  ["silver", "Silver"],
  ["crystal", "Crystal"],
  ["ruby", "Ruby"],
  ["sapphire", "Sapphire"],
  ["emerald", "Emerald"],
  ["firered", "FireRed"],
  ["leafgreen", "LeafGreen"],
  ["diamond", "Diamond"],
  ["pearl", "Pearl"],
  ["platinum", "Platinum"],
  ["heartgold", "HeartGold"],
  ["soulsilver", "SoulSilver"],
  ["black", "Black"],
  ["white", "White"],
  ["black2", "Black 2"],
  ["white2", "White 2"],
  ["x", "X"],
  ["y", "Y"],
  ["omegaruby", "Omega Ruby"],
  ["alphasapphire", "Alpha Sapphire"],
  ["sun", "Sun"],
  ["moon", "Moon"],
  ["ultrasun", "Ultra Sun"],
  ["ultramoon", "Ultra Moon"],
  ["sword", "Sword"],
  ["shield", "Shield"],
  ["brilliantdiamond", "Brilliant Diamond"],
  ["shiningpearl", "Shining Pearl"],
  ["scarlet", "Scarlet"],
  ["violet", "Violet"],
];

/** Params understood as "this is the species". */
const SPECIES_KEYS = ["pokemon", "species", "pkmn"];
const NDEX_KEYS = ["ndex"];
const LEVEL_KEYS = ["level", "lv"];
const OT_KEYS = ["ot"];
const OTID_KEYS = ["id", "idno", "otid"];
const ABILITY_KEYS = ["ability1", "ability"];
const NATURE_KEYS = ["nature"];
const RIBBON_KEYS = ["ribbon"];
const METHOD_KEYS = ["method", "obtain", "encounter"];
const DATE_KEYS = ["datedis", "date", "period"];
const GAME_CODE_KEYS = ["game", "games"];
const MET_KEYS = ["met"];

/**
 * Builds an EventRow from one event "block": the head/standalone template's
 * kv params, any following /entry-style templates, and the raw wikitext that
 * trails the block (used only to summarize a nested location/date table).
 * Returns null if the block has no resolvable species (counted by the caller
 * as skipped-no-species, not skipped-unresolved).
 */
export function buildEventRowFromBlock(
  kv: Record<string, string>,
  entries: EntryInfo[],
  tailText: string,
  headingText: string | null,
  title: string,
  sourcePage: string,
  resolver: SpeciesResolver,
  usedSlugs: Set<string>,
): { row: EventRow | null; hadSpecies: boolean } {
  const speciesRaw = firstDefined(kv, SPECIES_KEYS);
  if (!speciesRaw) return { row: null, hadSpecies: false };

  const speciesClean = cleanWikitext(speciesRaw);
  if (!speciesClean) return { row: null, hadSpecies: false };

  const ndex = firstDefined(kv, NDEX_KEYS);
  const speciesId = resolver.resolve(speciesRaw, ndex);
  if (speciesId === null) return { row: null, hadSpecies: true };

  const level = cleanWikitext(firstDefined(kv, LEVEL_KEYS));
  const otName = cleanWikitext(firstDefined(kv, OT_KEYS));
  const otId = cleanWikitext(firstDefined(kv, OTID_KEYS));
  const ability = cleanWikitext(firstDefined(kv, ABILITY_KEYS));
  const nature = cleanWikitext(firstDefined(kv, NATURE_KEYS));
  const ribbon = cleanWikitext(firstDefined(kv, RIBBON_KEYS));
  const met = cleanWikitext(firstDefined(kv, MET_KEYS));
  const form = cleanWikitext(kv["form"]);
  const wctitle = cleanWikitext(kv["wctitle"]);

  const isShiny: 0 | 1 = /^yes$/i.test(kv["shiny"] ?? "") ? 1 : 0;

  // method: prefer distinct entry methods, else head-level method-ish keys.
  const entryMethods = uniqueNonEmpty(entries.map((e) => cleanWikitext(e.method)));
  const method = entryMethods.length > 0 ? entryMethods.join("; ") : cleanWikitext(firstDefined(kv, METHOD_KEYS));

  // games: entry game codes, else head-level boolean flags, else head-level game code.
  const entryGames = uniqueNonEmpty(entries.map((e) => (e.game ? gameLabel(e.game) : null)));
  const boolGames = GAME_BOOL_FLAGS.filter(([key]) => /^yes$/i.test(kv[key] ?? "")).map(([, label]) => label);
  const headCodeGames = firstDefined(kv, GAME_CODE_KEYS);
  const games =
    entryGames.length > 0
      ? entryGames.join("/")
      : boolGames.length > 0
        ? boolGames.join("/")
        : headCodeGames
          ? gameLabel(headCodeGames)
          : null;

  // date text pool, used only to derive year + notes; never stored raw.
  const entryDates = uniqueNonEmpty(entries.map((e) => cleanWikitext(e.date)));
  const headDate = cleanWikitext(firstDefined(kv, DATE_KEYS));
  const dateText = entryDates.join(" ") || headDate || "";
  const year = extractYear(dateText) ?? extractYear(tailText);

  const region = deriveRegionFromTitle(title);

  const tableSummary = summarizeTrailingTable(tailText);
  const noteParts: string[] = [];
  if (entries.length > 1) {
    const detail = entries
      .map((e) => `${cleanWikitext(e.method) ?? "?"} (${cleanWikitext(e.date) ?? "?"})`)
      .join("; ");
    noteParts.push(`Distributed via ${entries.length} methods: ${detail}`);
  }
  if (tableSummary) noteParts.push(tableSummary);
  if (met) noteParts.push(`Met location: ${met}`);
  const notes = noteParts.length > 0 ? noteParts.join(" ") : null;

  // Prefer a qualifier that actually adds information -- headings/wctitle
  // frequently just repeat the species name (e.g. a "===Bulbasaur==="
  // section for a single-Pokémon event), which would otherwise render as a
  // redundant "Bulbasaur — Bulbasaur".
  const qualifierCandidates = [wctitle, headingText, method];
  const nameQualifier =
    qualifierCandidates.find((c) => c && c.trim().toLowerCase() !== speciesClean.trim().toLowerCase()) ?? "Event";

  const name = form ? `${speciesClean} (${form}) — ${nameQualifier}` : `${speciesClean} — ${nameQualifier}`;

  const slugQualifier = [wctitle, headingText].find(
    (c) => c && c.trim().toLowerCase() !== speciesClean.trim().toLowerCase(),
  );
  const slug = makeUniqueSlug([speciesClean, form, slugQualifier, year], usedSlugs);

  const row: EventRow = {
    slug,
    name,
    speciesId,
    formId: null,
    year,
    games,
    region,
    method,
    otName,
    otId,
    ribbon,
    isShiny,
    notes,
    sourcePage,
  };
  // level/ability/nature are not part of the target schema's columns, but we
  // fold anything not already captured into notes when notes is otherwise
  // empty, so the level/ability aren't silently discarded.
  if (!row.notes && (level || ability || nature)) {
    const extras = [level ? `Lv. ${level}` : null, ability ? `Ability: ${ability}` : null, nature ? `Nature: ${nature}` : null]
      .filter(Boolean)
      .join(", ");
    row.notes = extras.length > 0 ? extras : null;
  }
  return { row, hadSpecies: true };
}

function firstDefined(kv: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (kv[k] !== undefined && kv[k] !== "") return kv[k];
  }
  return undefined;
}

function uniqueNonEmpty(arr: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export interface PageParseStats {
  eventsExtracted: number;
  skippedNoSpecies: number;
  skippedUnresolved: number;
  usedFallback: boolean;
}

/**
 * Runs the template-based state machine over one page's wikitext, producing
 * EventRows. This is the primary parser (Gen IV+ template style). Pure aside
 * from consuming a SpeciesResolver.
 */
export function parseEventTemplates(
  wikitext: string,
  title: string,
  resolver: SpeciesResolver,
  usedSlugs: Set<string>,
  stats: PageParseStats,
): EventRow[] {
  const text = stripCommentsAndRefs(wikitext);
  const templates = extractTopLevelTemplates(text);
  const headings = collectHeadings(text);
  const rows: EventRow[] = [];

  let currentKv: Record<string, string> | null = null;
  let currentStart = 0;
  let currentEntries: EntryInfo[] = [];
  let blockTailStart = 0;

  const flush = (nextStart: number) => {
    if (currentKv) {
      const tailText = text.slice(blockTailStart, nextStart);
      const headingText = nearestHeading(headings, currentStart);
      const { row, hadSpecies } = buildEventRowFromBlock(
        currentKv,
        currentEntries,
        tailText,
        headingText,
        title,
        title,
        resolver,
        usedSlugs,
      );
      if (row) {
        rows.push(row);
        stats.eventsExtracted++;
      } else if (hadSpecies) {
        stats.skippedUnresolved++;
      } else {
        stats.skippedNoSpecies++;
      }
    }
    currentKv = null;
    currentEntries = [];
  };

  for (let idx = 0; idx < templates.length; idx++) {
    const t = templates[idx];
    if (!/event|wondercard/i.test(t.name)) continue;
    const suffix = (t.name.split("/").pop() ?? "").trim().toLowerCase();
    const { kv, positional } = parseTemplateArgs(t.args);

    if (suffix === "head") {
      flush(t.start);
      currentKv = kv;
      currentStart = t.start;
      currentEntries = [];
      blockTailStart = t.end;
    } else if (suffix === "entry" || suffix === "entrybottom" || suffix === "only" || suffix === "single") {
      if (currentKv) {
        currentEntries.push(parseEntryPositional(positional));
        blockTailStart = t.end;
      }
    } else if (suffix.includes("footer")) {
      blockTailStart = t.end;
      // block stays open; flushed at next head/standalone/EOF.
    } else {
      // standalone (Gen I-VII style): a complete event in one template.
      flush(t.start);
      currentKv = kv;
      currentStart = t.start;
      currentEntries = [];
      blockTailStart = t.end;
      const nextStart = templates[idx + 1]?.start ?? text.length;
      flush(nextStart);
    }
  }
  flush(text.length);

  return rows;
}

// ---------------------------------------------------------------------------
// Wikitable fallback parser (Gen I-III / regional pages with no templates)
// ---------------------------------------------------------------------------

/**
 * Like `splitTopLevel`, but splits on an arbitrary literal separator (e.g.
 * `"||"`, MediaWiki's same-line table-cell separator) instead of a single
 * `"|"`, still treating `{{...}}` / `[[...]]` spans as opaque.
 */
export function splitTopLevelOn(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      cur += two;
      i += 2;
      continue;
    }
    if (two === "}}" || two === "]]") {
      depth = Math.max(0, depth - 1);
      cur += two;
      i += 2;
      continue;
    }
    if (depth === 0 && s.slice(i, i + sep.length) === sep) {
      parts.push(cur);
      cur = "";
      i += sep.length;
      continue;
    }
    cur += s[i];
    i++;
  }
  parts.push(cur);
  return parts;
}

/**
 * MediaWiki table cells may be written as `attr="..." | content` on a single
 * line/segment (attributes and content sharing one leading "|"). Strips that
 * attribute prefix off, if present, so downstream parsing sees just the cell
 * content instead of e.g. `style="text-align:center" | {{p|Mew}}`.
 */
export function stripWikitableCellAttrs(raw: string): string {
  const trimmed = raw.trim();
  const parts = splitTopLevel(trimmed);
  if (parts.length >= 2) {
    const attrCandidate = parts[0].trim();
    if (/^[A-Za-z][\w-]*\s*=/.test(attrCandidate) && !/^\{\{|^\[\[/.test(attrCandidate)) {
      return parts.slice(1).join("|").trim();
    }
  }
  return trimmed;
}

/**
 * Parses a `{| ... |}` wikitable body into header cells + data rows, honoring
 * both `||`-separated cells on one line and `attr | content` cell attributes.
 */
function parseWikitableGrid(table: string): { headerCells: string[]; dataRows: string[][] } {
  const lines = table.split("\n");
  let headerCells: string[] = [];
  let curRowCells: string[] = [];
  const dataRows: string[][] = [];
  let inHeader = true;

  const flushRow = () => {
    if (inHeader) {
      if (headerCells.length === 0) headerCells = curRowCells;
      inHeader = false;
    } else if (curRowCells.length > 0) {
      dataRows.push(curRowCells);
    }
    curRowCells = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|-")) {
      flushRow();
    } else if (trimmed.startsWith("!")) {
      for (const cell of splitTopLevelOn(trimmed.slice(1), "!!")) headerCells.push(stripWikitableCellAttrs(cell));
    } else if (trimmed.startsWith("|") && !trimmed.startsWith("|}") && !trimmed.startsWith("|+")) {
      for (const cell of splitTopLevelOn(trimmed.slice(1), "||")) curRowCells.push(stripWikitableCellAttrs(cell));
    }
  }
  flushRow();
  return { headerCells, dataRows };
}

/**
 * Finds a `{{p|Name}}` / `{{pkmn|Name}}` template in a "Reward" table cell
 * that is immediately followed by "joins" (optionally with a gender symbol
 * in between), e.g. `{{p|Venonat}}♂ joins` -- the pattern Bulbapedia's
 * Pokémon Mystery Dungeon Wonder Mail tables use to mark a recruit-Pokémon
 * reward (as opposed to an item/TM reward, which this deliberately does not
 * match). Returns the raw species text, or null if the cell isn't a
 * recruit-Pokémon reward.
 */
export function extractRecruitedSpeciesFromReward(rewardRaw: string): string | null {
  const templates = extractTopLevelTemplates(rewardRaw);
  for (const t of templates) {
    const name = t.name.trim().toLowerCase();
    if (name !== "p" && name !== "pkmn") continue;
    const after = rewardRaw.slice(t.end);
    if (/^\s*[♀♂]?\s*joins\b/i.test(after)) {
      const positional = splitTopLevel(t.args).map((p) => p.trim());
      return positional[0] || null;
    }
  }
  return null;
}

/** Derives the Mystery Dungeon game label a Wonder Mail page's title names, if any. */
export function deriveMysteryDungeonGames(title: string): string | null {
  if (/explorers of sky/i.test(title)) return "Mystery Dungeon: Explorers of Sky";
  if (/explorers of time and explorers of darkness/i.test(title))
    return "Mystery Dungeon: Explorers of Time/Explorers of Darkness";
  return null;
}

/** Derives the Wonder Mail variant ("Wonder Mail" vs "Wonder Mail S") a page's title names, if any. */
export function deriveWonderMailMethod(title: string): string | null {
  if (/wonder mail s/i.test(title)) return "Wonder Mail S";
  if (/wonder mail/i.test(title)) return "Wonder Mail";
  return null;
}

interface WikitableColumns {
  species: number;
  ndex: number;
  level: number;
  ot: number;
  otId: number;
  ribbon: number;
  games: number;
  method: number;
  date: number;
  region: number;
  reward: number;
  objective: number;
  place: number;
  difficulty: number;
}

function findWikitableColumns(headerCells: string[]): WikitableColumns {
  const find = (re: RegExp) => headerCells.findIndex((h) => re.test(h));
  return {
    species: find(/pok[eé]mon|species/i),
    ndex: find(/ndex|dex\s*no|national\s*(no\.?|dex)|^no\.?$/i),
    level: find(/\blevel\b|\blv\.?\b/i),
    ot: find(/\bot\b|original trainer/i),
    otId: find(/\bid\b|trainer id|\btid\b/i),
    ribbon: find(/ribbon/i),
    games: find(/\bgames?\b|\bversions?\b/i),
    method: find(/\bmethod\b|\bobtain(ed)?\b|distribution method/i),
    date: find(/\bdate\b|\bperiod\b/i),
    region: find(/\bregion\b|\bcountr(y|ies)\b/i),
    reward: find(/\breward\b/i),
    objective: find(/\bobjective\b/i),
    place: find(/\bplace\b|\blocation\b/i),
    difficulty: find(/\bdifficulty\b/i),
  };
}

/**
 * Extracts one EventRow per data row from a wikitable that has a species-ish
 * column, pulling out any recognized level/OT/ID/ribbon/games/method/date/
 * region columns into their proper EventRow fields (rather than dumping
 * everything into `notes`, as a plain species-only table would need).
 * Columns that aren't recognized are folded into `notes`.
 */
function parseSpeciesWikitable(
  dataRows: string[][],
  cols: WikitableColumns,
  title: string,
  resolver: SpeciesResolver,
  usedSlugs: Set<string>,
  stats: PageParseStats,
): EventRow[] {
  const rows: EventRow[] = [];
  const titleRegion = deriveRegionFromTitle(title);
  const recognizedIdx = new Set(
    [cols.species, cols.ndex, cols.level, cols.ot, cols.otId, cols.ribbon, cols.games, cols.method, cols.date, cols.region].filter(
      (i) => i >= 0,
    ),
  );

  for (const cells of dataRows) {
    const speciesCellRaw = cells[cols.species];
    if (!speciesCellRaw) continue;
    const speciesClean = cleanWikitext(speciesCellRaw);
    if (!speciesClean) continue;
    const ndexText = cols.ndex >= 0 ? cleanWikitext(cells[cols.ndex]) : null;
    const ndexDigits = ndexText ? /\d+/.exec(ndexText)?.[0] : undefined;
    const speciesId = resolver.resolve(speciesCellRaw, ndexDigits);
    if (speciesId === null) {
      stats.skippedUnresolved++;
      continue;
    }

    const dateText = cols.date >= 0 ? cleanWikitext(cells[cols.date]) : null;
    const leftoverText = cells.filter((_, i) => !recognizedIdx.has(i)).join(" ");
    const year = extractYear(dateText) ?? extractYear(leftoverText);
    const rowRegion = cols.region >= 0 ? cleanWikitext(cells[cols.region]) : null;
    const notes = cleanWikitext(leftoverText);
    const slug = makeUniqueSlug([speciesClean, title, year], usedSlugs);

    rows.push({
      slug,
      name: `${speciesClean} — ${title}`,
      speciesId,
      formId: null,
      year,
      games: cols.games >= 0 ? cleanWikitext(cells[cols.games]) : null,
      region: rowRegion ?? titleRegion,
      method: cols.method >= 0 ? cleanWikitext(cells[cols.method]) : null,
      otName: cols.ot >= 0 ? cleanWikitext(cells[cols.ot]) : null,
      otId: cols.otId >= 0 ? cleanWikitext(cells[cols.otId]) : null,
      ribbon: cols.ribbon >= 0 ? cleanWikitext(cells[cols.ribbon]) : null,
      isShiny: 0,
      notes,
      sourcePage: title,
    });
    stats.eventsExtracted++;
  }
  return rows;
}

/**
 * Extracts one EventRow per recruit-Pokémon reward row from a Mystery
 * Dungeon Wonder Mail mission table (Password/Client/Objective/Place/
 * Difficulty/Reward-style columns, no species column of its own -- the
 * distributed Pokémon is named inside the Reward cell, e.g.
 * `{{p|Venonat}}♂ joins`). Rows whose reward is an item/TM (no "joins"
 * match) are skipped, not fabricated.
 */
function parseRewardJoinWikitable(
  dataRows: string[][],
  cols: WikitableColumns,
  title: string,
  headingText: string | null,
  resolver: SpeciesResolver,
  usedSlugs: Set<string>,
  stats: PageParseStats,
): EventRow[] {
  const rows: EventRow[] = [];
  const region = deriveRegionFromTitle(title);
  const games = deriveMysteryDungeonGames(title);
  const method = deriveWonderMailMethod(title);
  const year = extractYear(headingText);

  for (const cells of dataRows) {
    const rewardRaw = cells[cols.reward];
    if (!rewardRaw) continue;
    const speciesRaw = extractRecruitedSpeciesFromReward(rewardRaw);
    if (!speciesRaw) {
      stats.skippedNoSpecies++;
      continue;
    }
    const speciesClean = cleanWikitext(speciesRaw);
    if (!speciesClean) {
      stats.skippedNoSpecies++;
      continue;
    }
    const speciesId = resolver.resolve(speciesRaw, undefined);
    if (speciesId === null) {
      stats.skippedUnresolved++;
      continue;
    }

    const objective = cols.objective >= 0 ? cleanWikitext(cells[cols.objective]) : null;
    const place = cols.place >= 0 ? cleanWikitext(cells[cols.place]) : null;
    const difficulty = cols.difficulty >= 0 ? cleanWikitext(cells[cols.difficulty]) : null;
    const detailParts = [objective, place ? `at ${place}` : null, difficulty ? `(difficulty ${difficulty})` : null].filter(
      (p): p is string => !!p,
    );
    const notes = detailParts.length > 0 ? `Recruited via Wonder Mail mission: ${detailParts.join(" ")}` : "Recruited via Wonder Mail mission";

    const slug = makeUniqueSlug([speciesClean, title, year], usedSlugs);
    rows.push({
      slug,
      name: `${speciesClean} — ${title}`,
      speciesId,
      formId: null,
      year,
      games,
      region,
      method,
      otName: null,
      otId: null,
      ribbon: null,
      isShiny: 0,
      notes,
      sourcePage: title,
    });
    stats.eventsExtracted++;
  }
  return rows;
}

/**
 * Fallback for pages that yield zero events from the template parser: scans
 * `{| ... |}` wikitables for either (a) a species-ish column, extracting any
 * recognized level/OT/ID/ribbon/games/method/date/region columns alongside
 * it, or (b) a Mystery Dungeon Wonder Mail "Reward" column naming a
 * recruit-Pokémon (no species column of its own). Folds any unrecognized
 * columns into `notes`. Cannot recover fields the source table simply
 * doesn't carry -- this exists to avoid a hard zero on prose/table-only
 * pages, not to guess.
 */
export function parseEventWikitables(
  wikitext: string,
  title: string,
  resolver: SpeciesResolver,
  usedSlugs: Set<string>,
  stats: PageParseStats,
): EventRow[] {
  const text = stripCommentsAndRefs(wikitext);
  const rows: EventRow[] = [];
  const tableRe = /\{\|[\s\S]*?\n\|\}/g;
  let tableMatch: RegExpExecArray | null;
  const headings = collectHeadings(text);

  while ((tableMatch = tableRe.exec(text)) !== null) {
    const { headerCells, dataRows } = parseWikitableGrid(tableMatch[0]);
    const cols = findWikitableColumns(headerCells);

    if (cols.species !== -1) {
      rows.push(...parseSpeciesWikitable(dataRows, cols, title, resolver, usedSlugs, stats));
    } else if (cols.reward !== -1) {
      const headingText = nearestHeading(headings, tableMatch.index);
      rows.push(...parseRewardJoinWikitable(dataRows, cols, title, headingText, resolver, usedSlugs, stats));
    }
  }
  return rows;
}

/** Runs the template parser, then the wikitable fallback only if it found nothing. */
export function parsePage(
  wikitext: string,
  title: string,
  resolver: SpeciesResolver,
  usedSlugs: Set<string>,
): { rows: EventRow[]; stats: PageParseStats } {
  const stats: PageParseStats = { eventsExtracted: 0, skippedNoSpecies: 0, skippedUnresolved: 0, usedFallback: false };
  const rows = parseEventTemplates(wikitext, title, resolver, usedSlugs, stats);
  if (rows.length === 0) {
    stats.usedFallback = true;
    const fallbackRows = parseEventWikitables(wikitext, title, resolver, usedSlugs, stats);
    return { rows: fallbackRows, stats };
  }
  return { rows, stats };
}

// ---------------------------------------------------------------------------
// MediaWiki API access (polite: rate-limited, retry/backoff).
// ---------------------------------------------------------------------------

const DELAY_MS = 1000; // ~1 req/sec, sequential (single worker) per instructions.
const MAX_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch<T>(params: Record<string, string>): Promise<T> {
  const url = `${API_BASE}?${new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString()}`;
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      if (!contentType.includes("json")) {
        const body = await res.text();
        throw new Error(`Non-JSON response (content-type=${contentType}) for ${url}: ${body.slice(0, 300)}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const backoffMs = 500 * 2 ** attempt;
        console.warn(`  retry ${attempt + 1}/${MAX_RETRIES} after error: ${String(err)}`);
        await sleep(backoffMs);
      }
    }
  }
  throw new Error(`Failed after ${MAX_RETRIES + 1} attempts: ${String(lastError)}`);
}

interface ParseLinksResponse {
  parse?: { links: { ns: number; title: string }[] };
  error?: { code: string; info: string };
}

interface ParseWikitextResponse {
  parse?: { title: string; wikitext: string };
  error?: { code: string; info: string };
}

async function fetchLinks(page: string): Promise<string[]> {
  const res = await apiFetch<ParseLinksResponse>({ action: "parse", page, prop: "links" });
  if (res.error || !res.parse) {
    throw new Error(`fetchLinks(${page}) failed: ${res.error?.info ?? "unknown error"}`);
  }
  return res.parse.links.filter((l) => l.ns === 0).map((l) => l.title);
}

async function fetchWikitext(page: string): Promise<string | null> {
  const res = await apiFetch<ParseWikitextResponse>({ action: "parse", page, prop: "wikitext" });
  if (res.error || !res.parse) return null;
  return res.parse.wikitext;
}

function isEventDistributionPageTitle(title: string): boolean {
  if (/undistributed/i.test(title)) return false;
  return /^List of .+distribut/i.test(title);
}

const HUB_PAGES = ["List of event Pokémon distributions", "Event Pokémon"];

const MUST_HAVE_PAGES = [
  "List of event Pokémon distributions in Pokémon Sword and Shield",
  "List of event Pokémon distributions in Pokémon Brilliant Diamond and Shining Pearl",
  "List of event Pokémon distributions in Pokémon Legends: Arceus",
  "List of event Pokémon distributions in Pokémon Scarlet and Violet",
  "List of event Pokémon distributions in Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!",
];

async function enumeratePages(): Promise<string[]> {
  const titles = new Set<string>();
  for (const hub of HUB_PAGES) {
    console.log(`Fetching links from hub page: ${hub}`);
    const links = await fetchLinks(hub);
    for (const t of links) {
      if (isEventDistributionPageTitle(t)) titles.add(t);
    }
    await sleep(DELAY_MS);
  }
  for (const t of MUST_HAVE_PAGES) titles.add(t);
  return Array.from(titles).sort();
}

// ---------------------------------------------------------------------------
// main(): enumerate, fetch, parse, write snapshot.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.resolve(scriptsDir, "..", "data");
  const pokeapiSnapshotPath = path.join(dataDir, "pokeapi-snapshot.json");
  const pokeapiSnapshotRaw = await import("node:fs/promises").then((fs) => fs.readFile(pokeapiSnapshotPath, "utf8"));
  const pokeapiSnapshot = JSON.parse(pokeapiSnapshotRaw) as { species: { id: number; name: string }[] };
  const resolver = buildSpeciesResolver(pokeapiSnapshot);

  console.log("Enumerating the Bulbapedia event distribution directory...");
  const pages = await enumeratePages();
  console.log(`Found ${pages.length} candidate pages.`);

  const usedSlugs = new Set<string>();
  const allRows: EventRow[] = [];
  let pagesFetched = 0;
  let pagesFailed = 0;
  let pagesFallback = 0;
  let totalSkippedNoSpecies = 0;
  let totalSkippedUnresolved = 0;
  const lowCoveragePages: string[] = [];

  for (const title of pages) {
    let wikitext: string | null = null;
    try {
      wikitext = await fetchWikitext(title);
    } catch (err) {
      console.warn(`Failed to fetch "${title}": ${String(err)}`);
    }
    await sleep(DELAY_MS);

    if (wikitext === null) {
      pagesFailed++;
      console.warn(`  [skip] "${title}" -- page not found or fetch failed`);
      continue;
    }
    pagesFetched++;

    const { rows, stats } = parsePage(wikitext, title, resolver, usedSlugs);
    allRows.push(...rows);
    totalSkippedNoSpecies += stats.skippedNoSpecies;
    totalSkippedUnresolved += stats.skippedUnresolved;
    if (stats.usedFallback) pagesFallback++;
    if (rows.length === 0) lowCoveragePages.push(title);

    console.log(
      `  [${pagesFetched}/${pages.length}] "${title}": ${rows.length} events` +
        (stats.usedFallback ? " (fallback table parser)" : "") +
        (stats.skippedNoSpecies || stats.skippedUnresolved
          ? ` (skipped ${stats.skippedNoSpecies} no-species, ${stats.skippedUnresolved} unresolved)`
          : ""),
    );
  }

  allRows.sort((a, b) => a.speciesId - b.speciesId || a.slug.localeCompare(b.slug));

  const snapshot: EventsSnapshot = {
    _note:
      "Curated from Bulbapedia's event Pokémon distribution directory (comprehensive scrape of the full directory, " +
      "not a hand-picked subset). Granularity: one row per distributed Pokémon per event -- nested location/date " +
      "sub-tables are collapsed into `notes` rather than exploded into one row per location. Fields the source " +
      "wikitext did not clearly state are left null rather than inferred.",
    _source: "Bulbapedia (CC BY-NC-SA), fetched via MediaWiki API (action=parse, prop=wikitext)",
    events: allRows,
  };

  await mkdir(dataDir, { recursive: true });
  const outPath = path.join(dataDir, "events-snapshot.json");
  await writeFile(outPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log("\n=== Summary ===");
  console.log(`Pages fetched: ${pagesFetched}/${pages.length} (${pagesFailed} failed)`);
  console.log(`Pages using fallback table parser: ${pagesFallback}`);
  console.log(`Pages with zero events extracted: ${lowCoveragePages.length}`);
  if (lowCoveragePages.length > 0) {
    console.log(`  Low/no coverage: ${lowCoveragePages.join(", ")}`);
  }
  console.log(`Total events written: ${allRows.length}`);
  console.log(`Species resolved: ${allRows.length}; skipped (no species field): ${totalSkippedNoSpecies}; skipped (unresolved species): ${totalSkippedUnresolved}`);
  console.log(`Wrote snapshot to ${outPath}`);
}

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
