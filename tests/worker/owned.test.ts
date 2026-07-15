import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species, events } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values({
    id: 6,
    name: "charizard",
    generation: 1,
    types: JSON.stringify(["fire", "flying"]),
    spriteUrl: null,
  });
  await db.insert(events).values({
    slug: "test-event",
    name: "Test Event",
    speciesId: 6,
    year: 2020,
    games: "Sword/Shield",
    region: "Global",
    method: "Serial Code",
    isShiny: 0,
  });
});

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
  const path = `/api/auth/verify?token=${new URL(devLink).searchParams.get("token")}`;
  const verify = await call(path, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
};

const findCharizard = async (cookie?: string) => {
  const res = await call("/api/species?q=charizard", undefined, cookie);
  expect(res.status).toBe(200);
  const body = (await res.json()) as any;
  return body.items.find((i: any) => i.name === "charizard");
};

const findTestEvent = async (cookie?: string) => {
  const res = await call("/api/events?q=Test%20Event", undefined, cookie);
  expect(res.status).toBe(200);
  const body = (await res.json()) as any;
  return body.items.find((i: any) => i.name === "Test Event");
};

describe("per-user owned flags", () => {
  it("shows owned:false for a signed-in user with no specimens", async () => {
    const cookie = await signIn("owned-a@x.com");

    const charizard = await findCharizard(cookie);
    expect(charizard).toBeTruthy();
    expect(charizard.owned).toBe(false);

    const event = await findTestEvent(cookie);
    expect(event).toBeTruthy();
    expect(event.owned).toBe(false);
  });

  it("flips owned:true once the user has a matching specimen, and isolates other users", async () => {
    const cookieA = await signIn("owned-b@x.com");

    await postJson("/api/collection", { speciesId: 6, nickname: "Char" }, cookieA);
    await postJson(
      "/api/collection",
      { speciesId: 6, isEvent: 1, eventName: "Test Event" },
      cookieA,
    );

    const charizardA = await findCharizard(cookieA);
    expect(charizardA.owned).toBe(true);
    const eventA = await findTestEvent(cookieA);
    expect(eventA.owned).toBe(true);

    // A second, freshly signed-in user must not see the first user's ownership.
    const cookieB = await signIn("owned-c@x.com");
    const charizardB = await findCharizard(cookieB);
    expect(charizardB.owned).toBe(false);
    const eventB = await findTestEvent(cookieB);
    expect(eventB.owned).toBe(false);

    // Logged out (no cookie) must also see owned:false.
    const charizardLoggedOut = await findCharizard(undefined);
    expect(charizardLoggedOut.owned).toBe(false);
    const eventLoggedOut = await findTestEvent(undefined);
    expect(eventLoggedOut.owned).toBe(false);
  });
});
