# PokéFlexBank Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the PokéFlexBank Cloudflare application with its full database schema and a seeded, browsable catalog of every Pokémon species and form.

**Architecture:** A Vite + React single-page front-end served alongside a Hono API running on Cloudflare Workers. Data lives in Cloudflare D1 (SQLite) accessed through the Drizzle ORM; uploaded files (later phases) will live in R2. Reference data (species, forms) is seeded once from the free PokéAPI. This foundation is personal-first but uses the exact managed services that scale to a public product with no rewrite.

**Tech Stack:** Cloudflare Workers, D1, R2, Wrangler; Vite, React, TypeScript; Hono (API routing); Drizzle ORM + drizzle-kit (schema/migrations); Vitest + @cloudflare/vitest-pool-workers (tests).

## Global Constraints

- Runtime: Cloudflare Workers (no Node.js-only APIs in Worker code).
- Language: TypeScript, strict mode.
- Database: Cloudflare D1 via Drizzle ORM. All schema changes go through drizzle-kit migrations — never hand-edited SQL against production.
- Secrets: never committed. Local secrets live in `.dev.vars` (gitignored); deployed secrets use `wrangler secret put`.
- Reference data source: PokéAPI (https://pokeapi.co/api/v2/), fetched politely (rate-limited), cached to a committed JSON snapshot so seeding is reproducible and does not hammer the API on every run.
- Forms are first-class: every species may have zero or more forms (regional, mega, gigantamax, alternate-forme, gender-difference, other).
- Cloudflare account id for deploy: `0e56605411ec369074bb375df1b3de9e` (configured in `wrangler.jsonc`; not a secret).

---

## File Structure

```
pokeflexbank/
  wrangler.jsonc            # Worker + D1 + R2 bindings, account id
  package.json
  tsconfig.json
  vite.config.ts
  drizzle.config.ts         # drizzle-kit config (points at schema + migrations dir)
  .dev.vars                 # local secrets (gitignored)
  .gitignore
  src/
    worker/
      index.ts              # Hono app entry; mounts routes; serves SPA assets
      db.ts                 # Drizzle client factory from the D1 binding
      routes/
        health.ts           # GET /api/health
        species.ts          # GET /api/species (list/search), GET /api/species/:id
    db/
      schema/
        reference.ts        # species, forms tables (Drizzle)
        user.ts             # users, specimens, boxes, importJobs tables (Drizzle)
        index.ts            # re-exports all tables
    client/
      main.tsx              # React entry
      App.tsx               # router shell
      pages/
        SpeciesCatalog.tsx  # lists species from /api/species
      api.ts                # typed fetch helpers
  scripts/
    fetch-pokeapi.ts        # downloads species+forms from PokéAPI -> data/pokeapi-snapshot.json
    build-seed.ts           # snapshot JSON -> migrations/seed SQL
  data/
    pokeapi-snapshot.json   # committed reproducible snapshot
  migrations/               # drizzle-generated SQL migrations
  tests/
    worker/
      health.test.ts
      species.test.ts
    db/
      schema.test.ts
    scripts/
      build-seed.test.ts
```

Responsibilities:
- `src/db/schema/*` owns table definitions only (no queries).
- `src/worker/routes/*` owns one route group each; thin handlers that call Drizzle.
- `scripts/*` are Node build-time tools (may use Node APIs; not shipped to the Worker).
- `src/client/*` is the React app; talks to the Worker only through `api.ts`.

---

### Task 1: Scaffold the Cloudflare app and health endpoint

**Files:**
- Create: `pokeflexbank/wrangler.jsonc`, `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `.dev.vars`
- Create: `src/worker/index.ts`, `src/worker/routes/health.ts`
- Test: `tests/worker/health.test.ts`

**Interfaces:**
- Produces: a Hono app default-exported from `src/worker/index.ts` as `{ fetch }`; a `healthRoutes` Hono sub-app from `routes/health.ts` mounted at `/api`.
- Produces: `GET /api/health` → `200` JSON `{ status: "ok" }`.

- [ ] **Step 1: Scaffold with the vite-flare-starter skill**

Use the `cloudflare:vite-flare-starter` skill to scaffold a Vite + React + Hono + Workers app into `pokeflexbank/`. If scaffolding manually instead, initialize with `npm create cloudflare@latest pokeflexbank -- --framework=react --lang=ts` and add Hono (`npm i hono`). Set `name` and `account_id` in `wrangler.jsonc`.

- [ ] **Step 2: Add `.gitignore` and `.dev.vars`**

`.gitignore` must include: `node_modules`, `dist`, `.dev.vars`, `.wrangler`, `data/*.tmp`. Create an empty `.dev.vars` (secrets added in later plans).

- [ ] **Step 3: Write the failing test**

```ts
// tests/worker/health.test.ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../../src/worker/index";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const req = new Request("http://x/api/health");
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- health`
Expected: FAIL (cannot resolve `src/worker/index` or route missing).

- [ ] **Step 5: Implement health route and worker entry**

```ts
// src/worker/routes/health.ts
import { Hono } from "hono";
export const healthRoutes = new Hono();
healthRoutes.get("/health", (c) => c.json({ status: "ok" }));
```

```ts
// src/worker/index.ts
import { Hono } from "hono";
import { healthRoutes } from "./routes/health";
const app = new Hono();
app.route("/api", healthRoutes);
export default app;
```

Ensure `vitest.config`/`vite.config.ts` wires `@cloudflare/vitest-pool-workers` with `wrangler.jsonc`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- health`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pokeflexbank
git commit -m "feat: scaffold Cloudflare app with health endpoint"
```

---

### Task 2: Reference-data schema (species, forms)

**Files:**
- Create: `src/db/schema/reference.ts`, `src/db/schema/index.ts`, `drizzle.config.ts`
- Create: `src/worker/db.ts`
- Test: `tests/db/schema.test.ts`
- Migration: generated into `migrations/`

**Interfaces:**
- Produces: `species` table — `id` (int PK, national dex number), `name` (text), `generation` (int), `types` (text, JSON array), `spriteUrl` (text).
- Produces: `forms` table — `id` (int PK autoincrement), `speciesId` (int FK→species.id), `name` (text), `formType` (text: `regional`|`mega`|`gigantamax`|`alternate`|`gender`|`other`), `spriteUrl` (text).
- Produces: `getDb(d1: D1Database)` → Drizzle client, from `src/worker/db.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/schema.test.ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { species, forms } from "../../src/db/schema";

describe("reference schema", () => {
  it("inserts a species with a form", async () => {
    const db = getDb(env.DB);
    await db.insert(species).values({
      id: 6, name: "charizard", generation: 1,
      types: JSON.stringify(["fire", "flying"]),
      spriteUrl: "http://x/6.png",
    });
    await db.insert(forms).values({
      speciesId: 6, name: "charizard-mega-x", formType: "mega", spriteUrl: "http://x/6mx.png",
    });
    const rows = await db.select().from(forms);
    expect(rows).toHaveLength(1);
    expect(rows[0].formType).toBe("mega");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema`
Expected: FAIL (schema modules do not exist; table not migrated).

- [ ] **Step 3: Define the schema**

```ts
// src/db/schema/reference.ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
export const species = sqliteTable("species", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  generation: integer("generation").notNull(),
  types: text("types").notNull(),        // JSON array string
  spriteUrl: text("sprite_url"),
});
export const forms = sqliteTable("forms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  speciesId: integer("species_id").notNull().references(() => species.id),
  name: text("name").notNull(),
  formType: text("form_type").notNull(),
  spriteUrl: text("sprite_url"),
});
```

```ts
// src/db/schema/index.ts
export * from "./reference";
```

```ts
// src/worker/db.ts
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
export const getDb = (d1: D1Database) => drizzle(d1, { schema });
```

`drizzle.config.ts` points `schema` at `src/db/schema/index.ts`, `out` at `migrations/`, dialect `sqlite`, driver `d1-http`.

- [ ] **Step 4: Generate and apply the migration**

Use the `cloudflare:d1-migration` skill, or run:
```bash
npx drizzle-kit generate
npx wrangler d1 migrations apply pokeflexbank --local
```
Expected: a new SQL file in `migrations/`; tables created in the local D1.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- schema`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema src/worker/db.ts drizzle.config.ts migrations
git commit -m "feat: add species and forms reference schema"
```

---

### Task 3: User-data schema (users, specimens, boxes, importJobs)

**Files:**
- Modify: `src/db/schema/index.ts` (add export)
- Create: `src/db/schema/user.ts`
- Test: `tests/db/schema.test.ts` (add cases)
- Migration: generated into `migrations/`

**Interfaces:**
- Produces: `users` — `id` (text PK, uuid), `email` (text unique), `createdAt` (int, epoch ms).
- Produces: `boxes` — `id` (text PK, uuid), `userId` (FK→users.id), `name` (text).
- Produces: `specimens` — `id` (text PK, uuid), `userId` (FK), `speciesId` (FK→species.id), `formId` (int FK→forms.id, nullable), `nickname`, `level` (int), `isShiny` (int bool), `gender`, `nature`, `ability`, `heldItem`, `ball`, `otName`, `otId`, `metLocation`, `metDate`, `originGame`, `originEra`, `isEvent` (int bool), `eventName`, `ribbons` (text JSON), `ivs` (text JSON), `evs` (text JSON), `moves` (text JSON), `notes`, `boxId` (FK→boxes.id, nullable), `source` (text: `manual`|`csv`|`photo`|`savefile`), `createdAt` (int), `updatedAt` (int).
- Produces: `importJobs` — `id` (text PK, uuid), `userId` (FK), `type` (text), `status` (text), `rawFileKey` (text, R2 key, nullable), `preview` (text JSON, nullable), `createdAt` (int).

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/db/schema.test.ts
import { users, boxes, specimens } from "../../src/db/schema";

it("inserts a specimen linked to user, species, box", async () => {
  const db = getDb(env.DB);
  await db.insert(users).values({ id: "u1", email: "a@b.com", createdAt: 1 });
  await db.insert(boxes).values({ id: "b1", userId: "u1", name: "Living Dex" });
  await db.insert(species).values({ id: 25, name: "pikachu", generation: 1, types: "[]" });
  await db.insert(specimens).values({
    id: "s1", userId: "u1", speciesId: 25, boxId: "b1",
    isShiny: 1, isEvent: 0, source: "manual", createdAt: 1, updatedAt: 1,
  });
  const rows = await db.select().from(specimens);
  expect(rows[0].source).toBe("manual");
  expect(rows[0].isShiny).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema`
Expected: FAIL (user tables not defined/migrated).

- [ ] **Step 3: Define the schema**

```ts
// src/db/schema/user.ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { species, forms } from "./reference";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
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
```

Add `export * from "./user";` to `src/db/schema/index.ts`.

- [ ] **Step 4: Generate and apply the migration**

```bash
npx drizzle-kit generate
npx wrangler d1 migrations apply pokeflexbank --local
```
Expected: new migration file; tables created locally.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- schema`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema migrations
git commit -m "feat: add users, specimens, boxes, import_jobs schema"
```

---

### Task 4: Fetch and snapshot PokéAPI reference data

**Files:**
- Create: `scripts/fetch-pokeapi.ts`
- Create: `data/pokeapi-snapshot.json` (generated, committed)
- Test: `tests/scripts/build-seed.test.ts` (shape assertions on a small fixture)

**Interfaces:**
- Produces: `data/pokeapi-snapshot.json` shaped as `{ species: SpeciesRow[], forms: FormRow[] }` where
  `SpeciesRow = { id: number; name: string; generation: number; types: string[]; spriteUrl: string | null }`
  and `FormRow = { speciesId: number; name: string; formType: "regional"|"mega"|"gigantamax"|"alternate"|"gender"|"other"; spriteUrl: string | null }`.
- Produces: `classifyForm(formName: string): FormRow["formType"]` exported from `scripts/fetch-pokeapi.ts` for reuse and testing.

- [ ] **Step 1: Write the failing test**

```ts
// tests/scripts/build-seed.test.ts
import { describe, it, expect } from "vitest";
import { classifyForm } from "../../scripts/fetch-pokeapi";

describe("classifyForm", () => {
  it("classifies known form-name patterns", () => {
    expect(classifyForm("charizard-mega-x")).toBe("mega");
    expect(classifyForm("charizard-gmax")).toBe("gigantamax");
    expect(classifyForm("raichu-alola")).toBe("regional");
    expect(classifyForm("darmanitan-galar")).toBe("regional");
    expect(classifyForm("deoxys-attack")).toBe("alternate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- build-seed`
Expected: FAIL (`classifyForm` not exported).

- [ ] **Step 3: Implement the fetcher and classifier**

```ts
// scripts/fetch-pokeapi.ts  (Node build-time script)
export type FormType = "regional"|"mega"|"gigantamax"|"alternate"|"gender"|"other";
export function classifyForm(name: string): FormType {
  const n = name.toLowerCase();
  if (n.includes("mega")) return "mega";
  if (n.includes("gmax") || n.includes("gigantamax")) return "gigantamax";
  if (/-(alola|galar|hisui|paldea)/.test(n)) return "regional";
  if (/-(male|female|-m$|-f$)/.test(n)) return "gender";
  if (n.includes("-")) return "alternate";
  return "other";
}
// main(): page through /pokemon-species (limit=… offset=…) for species (id,name,
// generation), then /pokemon for types + sprites, then /pokemon-form for extra
// forms; rate-limit to ~5 req/s; write { species, forms } to
// data/pokeapi-snapshot.json. Guarded by `if (import.meta.main)` so importing the
// module for tests does not trigger network calls.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- build-seed`
Expected: PASS.

- [ ] **Step 5: Generate the snapshot**

Run: `npx tsx scripts/fetch-pokeapi.ts`
Expected: `data/pokeapi-snapshot.json` written with ~1000+ species and their forms. Spot-check that Charizard (id 6) has mega + gmax forms.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-pokeapi.ts data/pokeapi-snapshot.json tests/scripts/build-seed.test.ts
git commit -m "feat: fetch and snapshot PokeAPI species and forms"
```

---

### Task 5: Seed the database from the snapshot

**Files:**
- Create: `scripts/build-seed.ts`
- Create: `migrations/` seed SQL (generated by build-seed) OR a `wrangler d1 execute` file
- Test: `tests/scripts/build-seed.test.ts` (add case for SQL generation)

**Interfaces:**
- Consumes: `data/pokeapi-snapshot.json` (Task 4 shape).
- Produces: `snapshotToSql(snapshot): string` exported from `scripts/build-seed.ts` — emits idempotent `INSERT OR REPLACE` statements for `species` and `forms`.
- Produces: `data/seed.sql` (generated) applied via wrangler.

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/scripts/build-seed.test.ts
import { snapshotToSql } from "../../scripts/build-seed";

it("emits INSERT OR REPLACE for species and forms", () => {
  const sql = snapshotToSql({
    species: [{ id: 6, name: "charizard", generation: 1, types: ["fire","flying"], spriteUrl: null }],
    forms: [{ speciesId: 6, name: "charizard-mega-x", formType: "mega", spriteUrl: null }],
  });
  expect(sql).toContain("INSERT OR REPLACE INTO species");
  expect(sql).toContain("charizard");
  expect(sql).toContain("INSERT OR REPLACE INTO forms");
  expect(sql).toContain("mega");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- build-seed`
Expected: FAIL (`snapshotToSql` not defined).

- [ ] **Step 3: Implement SQL generation**

```ts
// scripts/build-seed.ts
type Snapshot = {
  species: { id:number; name:string; generation:number; types:string[]; spriteUrl:string|null }[];
  forms: { speciesId:number; name:string; formType:string; spriteUrl:string|null }[];
};
const q = (v: string | null) => v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
export function snapshotToSql(s: Snapshot): string {
  const sp = s.species.map(x =>
    `INSERT OR REPLACE INTO species (id,name,generation,types,sprite_url) VALUES ` +
    `(${x.id},${q(x.name)},${x.generation},${q(JSON.stringify(x.types))},${q(x.spriteUrl)});`);
  const fm = s.forms.map(x =>
    `INSERT OR REPLACE INTO forms (species_id,name,form_type,sprite_url) VALUES ` +
    `(${x.speciesId},${q(x.name)},${q(x.formType)},${q(x.spriteUrl)});`);
  return [...sp, ...fm].join("\n");
}
// main(): read snapshot, write data/seed.sql, guarded by import.meta.main.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- build-seed`
Expected: PASS.

- [ ] **Step 5: Generate and apply the seed**

```bash
npx tsx scripts/build-seed.ts
npx wrangler d1 execute pokeflexbank --local --file=data/seed.sql
```
Expected: species and forms rows present locally. Verify:
`npx wrangler d1 execute pokeflexbank --local --command "SELECT COUNT(*) FROM species;"`

- [ ] **Step 6: Commit**

```bash
git add scripts/build-seed.ts data/seed.sql tests/scripts/build-seed.test.ts
git commit -m "feat: generate and apply species/forms seed SQL"
```

---

### Task 6: Species browse/search API

**Files:**
- Create: `src/worker/routes/species.ts`
- Modify: `src/worker/index.ts` (mount species routes)
- Test: `tests/worker/species.test.ts`

**Interfaces:**
- Consumes: `getDb` (Task 2); `species`, `forms` tables.
- Produces: `GET /api/species?q=&gen=&limit=&offset=` → `200` JSON `{ items: SpeciesWithForms[], total: number }` where `SpeciesWithForms = { id, name, generation, types: string[], spriteUrl, forms: {id,name,formType,spriteUrl}[] }`.
- Produces: `GET /api/species/:id` → `200` single `SpeciesWithForms`, or `404` `{ error: "not_found" }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/worker/species.test.ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species, forms } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values({ id: 6, name: "charizard", generation: 1, types: JSON.stringify(["fire","flying"]), spriteUrl: null });
  await db.insert(forms).values({ speciesId: 6, name: "charizard-mega-x", formType: "mega", spriteUrl: null });
});

const call = async (path: string) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://x${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("species API", () => {
  it("lists species with nested forms and parsed types", async () => {
    const res = await call("/api/species?q=char");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.items[0].name).toBe("charizard");
    expect(body.items[0].types).toEqual(["fire","flying"]);
    expect(body.items[0].forms[0].formType).toBe("mega");
  });
  it("404s unknown id", async () => {
    const res = await call("/api/species/99999");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- species`
Expected: FAIL (route not mounted).

- [ ] **Step 3: Implement the route**

```ts
// src/worker/routes/species.ts
import { Hono } from "hono";
import { eq, like, and } from "drizzle-orm";
import { getDb } from "../db";
import { species, forms } from "../../db/schema";

type Env = { Bindings: { DB: D1Database } };
export const speciesRoutes = new Hono<Env>();

const shape = (s: any, f: any[]) => ({
  id: s.id, name: s.name, generation: s.generation,
  types: JSON.parse(s.types), spriteUrl: s.spriteUrl,
  forms: f.map(x => ({ id: x.id, name: x.name, formType: x.formType, spriteUrl: x.spriteUrl })),
});

speciesRoutes.get("/species", async (c) => {
  const db = getDb(c.env.DB);
  const q = c.req.query("q");
  const gen = c.req.query("gen");
  const limit = Math.min(Number(c.req.query("limit") ?? 60), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const conds = [];
  if (q) conds.push(like(species.name, `%${q.toLowerCase()}%`));
  if (gen) conds.push(eq(species.generation, Number(gen)));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(species).where(where).limit(limit).offset(offset);
  const ids = rows.map(r => r.id);
  const allForms = ids.length ? await db.select().from(forms) : [];
  const items = rows.map(s => shape(s, allForms.filter(f => f.speciesId === s.id)));
  return c.json({ items, total: items.length });
});

speciesRoutes.get("/species/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [s] = await db.select().from(species).where(eq(species.id, id));
  if (!s) return c.json({ error: "not_found" }, 404);
  const f = await db.select().from(forms).where(eq(forms.speciesId, id));
  return c.json(shape(s, f));
});
```

Mount in `src/worker/index.ts`: `app.route("/api", speciesRoutes);`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- species`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/routes/species.ts src/worker/index.ts tests/worker/species.test.ts
git commit -m "feat: add species browse/search API"
```

---

### Task 7: Species catalog page (front-to-back wiring)

**Files:**
- Create: `src/client/api.ts`, `src/client/pages/SpeciesCatalog.tsx`
- Modify: `src/client/App.tsx`, `src/client/main.tsx`
- Test: `tests/worker/species.test.ts` already covers the API; add a lightweight component render test if a jsdom setup exists, otherwise verify manually in Step 4.

**Interfaces:**
- Consumes: `GET /api/species` (Task 6).
- Produces: `fetchSpecies(params): Promise<{items: SpeciesWithForms[]; total: number}>` from `api.ts`.
- Produces: a `SpeciesCatalog` React component rendering a searchable grid of species with their forms.

- [ ] **Step 1: Implement the typed API helper**

```ts
// src/client/api.ts
export type FormDto = { id: number; name: string; formType: string; spriteUrl: string | null };
export type SpeciesDto = { id: number; name: string; generation: number; types: string[]; spriteUrl: string | null; forms: FormDto[] };
export async function fetchSpecies(params: { q?: string; gen?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.gen) qs.set("gen", String(params.gen));
  const res = await fetch(`/api/species?${qs}`);
  if (!res.ok) throw new Error(`species fetch failed: ${res.status}`);
  return res.json() as Promise<{ items: SpeciesDto[]; total: number }>;
}
```

- [ ] **Step 2: Implement the catalog page**

```tsx
// src/client/pages/SpeciesCatalog.tsx
import { useEffect, useState } from "react";
import { fetchSpecies, type SpeciesDto } from "../api";
export function SpeciesCatalog() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SpeciesDto[]>([]);
  useEffect(() => {
    const t = setTimeout(() => { fetchSpecies({ q }).then(r => setItems(r.items)); }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <h1>PokéFlexBank — Catalog</h1>
      <input placeholder="Search species…" value={q} onChange={e => setQ(e.target.value)} />
      <ul>
        {items.map(s => (
          <li key={s.id}>
            #{s.id} {s.name} — {s.types.join("/")}
            {s.forms.length > 0 && <> · forms: {s.forms.map(f => f.name).join(", ")}</>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Render `<SpeciesCatalog />` from `App.tsx`.

- [ ] **Step 3: Verify end-to-end in the dev server**

Run: `npm run dev`
Open the printed local URL. Expected: typing "char" shows Charizard with its mega/gmax forms — proving React → Worker → D1 works end to end.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client
git commit -m "feat: species catalog page wired to API"
```

---

## Self-Review

**Spec coverage (Foundation slice):**
- Cloudflare stack (Workers, D1, R2 binding, Vite/React, Hono, Drizzle) → Tasks 1–3, 6, 7. ✅
- Species + forms reference data, forms first-class with type classification → Tasks 2, 4, 6. ✅
- Full user-data model (specimens with OT/ID, event fields, IVs/EVs/moves/ribbons, boxes, import_jobs) → Task 3. ✅ (CRUD/UI deferred to the Specimen-core plan by design.)
- PokéAPI seeding, reproducible → Tasks 4–5. ✅
- Auth, Living Dex UI, dashboard, manual/CSV/JSON import → intentionally out of scope for Foundation; covered by plans 2–4.

**Placeholder scan:** No TBD/TODO in steps; the only prose-described bodies are the two Node `main()` functions (network/file glue), whose exported, tested units (`classifyForm`, `snapshotToSql`) have full code. Acceptable.

**Type consistency:** `SpeciesWithForms`/`SpeciesDto` field names (`id,name,generation,types,spriteUrl,forms`) and `FormType` values (`regional|mega|gigantamax|alternate|gender|other`) are used identically across Tasks 2, 4, 5, 6, 7. `getDb` signature consistent (Tasks 2, 3, 6). Column names snake_case in SQL match Drizzle mappings.

**R2 note:** R2 bucket binding is declared in `wrangler.jsonc` (Task 1) but unused until the import plans — declared now to avoid a later config migration.
