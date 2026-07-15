import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";
import { __setRecognizerForTest } from "../../src/worker/routes/photo-import";
import type { VisionRecognizer } from "../../src/worker/import/vision";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values({
    id: 6,
    name: "charizard",
    generation: 1,
    types: JSON.stringify(["fire", "flying"]),
    spriteUrl: null,
  });
});

afterEach(() => {
  __setRecognizerForTest(null);
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

const mockRecognizer = (): VisionRecognizer => ({
  recognize: async () => [
    { speciesName: "charizard", shiny: true },
    { speciesName: "notamon", shiny: false },
  ],
});

const postFakeImage = async (path: string, cookie?: string) => {
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }), "box.png");
  const ctx = createExecutionContext();
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { method: "POST", headers, body: form }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("photo-import preview", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await postFakeImage("/api/import/photo/preview");
    expect(res.status).toBe(401);
  });

  it("returns 503 vision_unavailable when no recognizer is configured", async () => {
    const cookie = await signIn("novision@x.com");
    const res = await postFakeImage("/api/import/photo/preview", cookie);
    expect(res.status).toBe(503);
    const body = (await res.json()) as any;
    expect(body.error).toBe("vision_unavailable");
  });

  it("resolves recognized species into a Phase-4-shaped preview using a mock recognizer", async () => {
    __setRecognizerForTest(mockRecognizer());
    const cookie = await signIn("vision@x.com");
    const res = await postFakeImage("/api/import/photo/preview", cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.validCount).toBe(1);
    expect(body.errorCount).toBe(1);
    expect(body.rows).toHaveLength(2);

    const charizardRow = body.rows.find((r: any) => r.input?.speciesId === 6);
    expect(charizardRow).toBeTruthy();
    expect(charizardRow.input.isShiny).toBe(1);
    expect(charizardRow.errors).toEqual([]);

    const unknownRow = body.rows.find((r: any) => r.input === null);
    expect(unknownRow).toBeTruthy();
    expect(unknownRow.errors.some((e: string) => e.includes("notamon"))).toBe(true);
  });
});
