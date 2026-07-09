import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species, forms } from "../../src/db/schema";

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
