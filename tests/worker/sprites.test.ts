import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../../src/worker/index";

const call = async (path: string) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://x${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("sprite routes", () => {
  it("fetches from upstream, caches to R2, and serves the image", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toBe(
        "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/6.png",
      );
      return new Response(FAKE_PNG, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as typeof globalThis.fetch;

    const res = await call("/sprites/home/6");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");

    const cached = await env.SPRITES.get("home/6.png");
    expect(cached).not.toBeNull();
  });

  it("serves subsequent requests from R2 without hitting upstream again", async () => {
    globalThis.fetch = (async () => {
      throw new Error("should not fetch upstream when cached");
    }) as typeof globalThis.fetch;

    const res = await call("/sprites/home/6");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
  });

  it("400s a non-numeric id", async () => {
    const res = await call("/sprites/home/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "bad_id" });
  });

  it("404s when upstream returns non-200", async () => {
    globalThis.fetch = (async () => {
      return new Response(null, { status: 404 });
    }) as typeof globalThis.fetch;

    const res = await call("/sprites/home/999999");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "not_found" });
  });

  it("fetches, caches, and serves the shiny variant with a distinct key", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toBe(
        "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/6.png",
      );
      return new Response(FAKE_PNG, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as typeof globalThis.fetch;

    const res = await call("/sprites/home/shiny/6");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");

    const cached = await env.SPRITES.get("home/shiny/6.png");
    expect(cached).not.toBeNull();
  });
});
