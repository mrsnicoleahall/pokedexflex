import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";
import { encryptPk7 } from "../../src/worker/import/pk7";

const PK7_SIZE = 232;
const USUM_SAVE_SIZE = 0x6cc00;
const BOX_OFFSET = 0x05200;
const FOOTER_MAGIC_OFFSET_FROM_END = 0x1f0;
const FOOTER_MAGIC = 0x42454546; // "BEEF"

/** Build a canonical (decrypted, unshuffled) 232-byte PK7 buffer with just a species + EC. */
const buildDecrypted = (ec: number, speciesId: number): Uint8Array => {
  const buf = new Uint8Array(PK7_SIZE);
  const view = new DataView(buf.buffer);
  view.setUint32(0x00, ec >>> 0, true); // EC
  view.setUint16(0x08, speciesId, true); // species
  return buf;
};

/** Build a zeroed synthetic USUM save buffer with the BEEF footer magic, with 2 placed mons. */
const buildSyntheticUsumSave = (): Uint8Array => {
  const buf = new Uint8Array(USUM_SAVE_SIZE);
  const view = new DataView(buf.buffer);
  view.setUint32(USUM_SAVE_SIZE - FOOTER_MAGIC_OFFSET_FROM_END, FOOTER_MAGIC, true);

  const charmander = encryptPk7(buildDecrypted(0x12345678, 6));
  const pikachu = encryptPk7(buildDecrypted(0xcafebabe, 25));
  buf.set(charmander, BOX_OFFSET);
  buf.set(pikachu, BOX_OFFSET + PK7_SIZE);

  return buf;
};

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values([
    { id: 6, name: "charizard", generation: 1, types: JSON.stringify(["fire", "flying"]), spriteUrl: null },
    { id: 25, name: "pikachu", generation: 1, types: JSON.stringify(["electric"]), spriteUrl: null },
  ]);
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

const postSave = async (path: string, bytes: Uint8Array, cookie?: string) => {
  const form = new FormData();
  form.set("save", new Blob([bytes], { type: "application/octet-stream" }), "save.sav");
  const ctx = createExecutionContext();
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { method: "POST", headers, body: form }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("save-import preview", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await postSave("/api/import/save/preview", buildSyntheticUsumSave());
    expect(res.status).toBe(401);
  });

  it("returns 400 unsupported_save for a non-USUM buffer", async () => {
    const cookie = await signIn("badsave@x.com");
    const res = await postSave("/api/import/save/preview", new Uint8Array(1000), cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("unsupported_save");
  });

  it("parses a synthetic USUM save into a Phase-4-shaped preview with 2 valid rows", async () => {
    const cookie = await signIn("saveimport@x.com");
    const res = await postSave("/api/import/save/preview", buildSyntheticUsumSave(), cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.rows).toHaveLength(2);
    expect(body.validCount).toBe(2);
    expect(body.errorCount).toBe(0);

    const speciesIds = body.rows.map((r: any) => r.input?.speciesId).sort((a: number, b: number) => a - b);
    expect(speciesIds).toEqual([6, 25]);
  });
});
