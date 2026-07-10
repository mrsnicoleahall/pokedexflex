import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species, events } from "../../src/db/schema";
import { users, boxes, specimens } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values({
    id: 151,
    name: "mew",
    generation: 1,
    types: JSON.stringify(["psychic"]),
    spriteUrl: null,
    homeId: 151,
  });
  await db.insert(events).values({
    slug: "mew-test",
    name: "Mew — Test",
    speciesId: 151,
    year: 2016,
    games: "Sun/Moon",
    region: "Global",
    method: "Serial Code",
    isShiny: 0,
  });
  await db.insert(events).values({
    slug: "unowned-test",
    name: "Unowned — Test",
    speciesId: 151,
    isShiny: 0,
  });
  await db.insert(users).values({ id: "demo-test", email: "demo-test@example.com", createdAt: 0 });
  await db.insert(boxes).values({ id: "demo-events-test", userId: "demo-test", name: "Events" });
  await db.insert(specimens).values({
    id: "specimen-test-1",
    userId: "demo-test",
    speciesId: 151,
    isShiny: 0,
    isEvent: 1,
    eventName: "Mew — Test",
    boxId: "demo-events-test",
    source: "test",
    createdAt: 0,
    updatedAt: 0,
  });
});

const call = async (path: string) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://x${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("events API", () => {
  it("lists events with joined species info and owned flag", async () => {
    const res = await call("/api/events?q=mew&owner=demo-test");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const mewEvent = body.items.find((i: any) => i.name === "Mew — Test");
    expect(mewEvent).toBeTruthy();
    expect(mewEvent.speciesName).toBe("mew");
    expect(mewEvent.speciesTypes).toEqual(["psychic"]);
    expect(mewEvent.homeId).toBe(151);
    expect(mewEvent.owned).toBe(true);

    const unowned = body.items.find((i: any) => i.name === "Unowned — Test");
    expect(unowned).toBeTruthy();
    expect(unowned.owned).toBe(false);
  });

  it("total reflects the count of matches, not just the page size", async () => {
    const res = await call("/api/events?q=mew&limit=1&owner=demo-test");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.length).toBe(1);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it("filters by q against event name or species name", async () => {
    const res = await call("/api/events?q=unowned&owner=demo-test");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.every((i: any) => i.name.toLowerCase().includes("unowned"))).toBe(true);
  });
});
