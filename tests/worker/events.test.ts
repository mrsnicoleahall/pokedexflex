import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species, events } from "../../src/db/schema";
import { users, boxes, specimens } from "../../src/db/schema";
import { eq } from "drizzle-orm";

const call = async (path: string, init?: RequestInit, cookie?: string) => {
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

const postJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);

/** Runs the real magic-link flow and returns the session cookie string for `email`. */
const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
};

let ownerCookie: string;

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

  // Sign in a real user (via the magic-link flow) and give them a specimen matching the "Mew — Test" event,
  // so "owned" below reflects the actual signed-in user rather than a demo/param override.
  ownerCookie = await signIn("events-owner@x.com");
  const [owner] = await db.select().from(users).where(eq(users.email, "events-owner@x.com"));
  await db.insert(boxes).values({ id: "demo-events-test", userId: owner.id, name: "Events" });
  await db.insert(specimens).values({
    id: "specimen-test-1",
    userId: owner.id,
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

describe("events API", () => {
  it("lists events with joined species info and owned flag", async () => {
    const res = await call("/api/events?q=mew", undefined, ownerCookie);
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

  it("shows owned:false for everyone when logged out", async () => {
    const res = await call("/api/events?q=mew");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const mewEvent = body.items.find((i: any) => i.name === "Mew — Test");
    expect(mewEvent.owned).toBe(false);
  });

  it("total reflects the count of matches, not just the page size", async () => {
    const res = await call("/api/events?q=mew&limit=1", undefined, ownerCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.length).toBe(1);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it("filters by q against event name or species name", async () => {
    const res = await call("/api/events?q=unowned", undefined, ownerCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.every((i: any) => i.name.toLowerCase().includes("unowned"))).toBe(true);
  });
});
