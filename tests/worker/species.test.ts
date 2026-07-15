import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species, forms, specimens, users } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values({ id: 6, name: "charizard", generation: 1, types: JSON.stringify(["fire","flying"]), spriteUrl: null });
  await db.insert(forms).values({ speciesId: 6, name: "charizard-mega-x", formType: "mega", spriteUrl: null });
  await db.insert(species).values({ id: 1, name: "bulbasaur", generation: 1, types: JSON.stringify(["grass","poison"]), spriteUrl: null });
});

const call = async (path: string) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://x${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

const callWith = async (path: string, init?: RequestInit, cookie?: string) => {
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};
const postJson = (path: string, body: unknown, cookie?: string) =>
  callWith(
    path,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    cookie,
  );
const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await callWith(path, { redirect: "manual" } as any);
  return verify.headers.get("set-cookie")!.split(";")[0];
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
  it("total reflects all matches, not just the returned page", async () => {
    const res = await call("/api/species?limit=1");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.items.length).toBe(1);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });
});

describe("GET /api/species — type filter", () => {
  it("returns only species whose JSON types include the slug (charizard is fire, bulbasaur is not)", async () => {
    const res = await call("/api/species?type=fire&limit=200");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // Every returned species is a fire type…
    for (const item of body.items) expect(item.types).toContain("fire");
    const ids = body.items.map((i: any) => i.id);
    expect(ids).toContain(6); // charizard (fire/flying), seeded in beforeAll
    expect(ids).not.toContain(1); // bulbasaur (grass/poison)
    // total reflects the filtered set (page query + count query share the WHERE).
    expect(body.total).toBe(body.items.length);
  });
});

describe("GET /api/species — sort", () => {
  it("defaults to dex order (id ascending)", async () => {
    const res = await call("/api/species?limit=200");
    const body = (await res.json()) as any;
    const ids = body.items.map((i: any) => i.id);
    expect([...ids].sort((a: number, b: number) => a - b)).toEqual(ids);
  });

  it("sort=name orders alphabetically by name", async () => {
    const res = await call("/api/species?sort=name&limit=200");
    const body = (await res.json()) as any;
    const names = body.items.map((i: any) => i.name);
    expect([...names].sort()).toEqual(names);
  });
});

describe("GET /api/species — owned / missing filter", () => {
  it("filters to owned when signed in, to missing otherwise, keeps total correct, and ignores the filter when signed out", async () => {
    const db = getDb(env.DB);
    // Unique species for this case (D1 state accumulates across it() blocks).
    await db.insert(species).values([
      { id: 9101, name: "filter-fire", generation: 3, types: JSON.stringify(["fire"]), homeId: 9101 },
      { id: 9102, name: "filter-water", generation: 3, types: JSON.stringify(["water"]), homeId: 9102 },
    ]);
    const email = "dexfilter-owned@x.com";
    const cookie = await signIn(email);
    const [u] = await db.select().from(users).where(eq(users.email, email));
    const now = Date.now();
    // This user owns exactly ONE species (9101).
    await db.insert(specimens).values({
      id: "df-s1",
      userId: u.id,
      speciesId: 9101,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });

    // Baseline unfiltered total, so we can assert the missing delta exactly.
    const baseRes = await call("/api/species?limit=1");
    const baseTotal = ((await baseRes.json()) as any).total as number;

    // owned=owned → exactly the one owned species.
    const ownedRes = await callWith("/api/species?owned=owned&limit=200", undefined, cookie);
    const ownedBody = (await ownedRes.json()) as any;
    expect(ownedBody.total).toBe(1);
    expect(ownedBody.items).toHaveLength(1);
    expect(ownedBody.items[0].id).toBe(9101);
    expect(ownedBody.items[0].owned).toBe(true);

    // owned=missing → everything EXCEPT the one owned species.
    const missingRes = await callWith("/api/species?owned=missing&limit=200", undefined, cookie);
    const missingBody = (await missingRes.json()) as any;
    expect(missingBody.total).toBe(baseTotal - 1);
    const missingIds = missingBody.items.map((i: any) => i.id);
    expect(missingIds).not.toContain(9101);
    expect(missingIds).toContain(9102);

    // Signed OUT + owned=owned → filter ignored (treated as "all"); the missing
    // species 9102 still comes back (an empty-owned-set filter would drop it).
    const outRes = await call("/api/species?owned=owned&q=filter-water&limit=200");
    const outBody = (await outRes.json()) as any;
    const outIds = outBody.items.map((i: any) => i.id);
    expect(outIds).toContain(9102);
  });
});
