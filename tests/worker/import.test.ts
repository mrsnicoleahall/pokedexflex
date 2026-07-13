import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";

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
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
};

const SAMPLE_CSV = "Species,Nickname,Level,Shiny\ncharizard,Blaze,100,yes\npikachu,,50,no\nNotAMon,,5,no";

describe("import/export API", () => {
  it("rejects unauthenticated preview/commit/export with 401", async () => {
    const previewRes = await postJson("/api/import/preview", { format: "csv", content: SAMPLE_CSV });
    expect(previewRes.status).toBe(401);

    const commitRes = await postJson("/api/import/commit", { format: "csv", content: SAMPLE_CSV });
    expect(commitRes.status).toBe(401);

    const exportRes = await call("/api/export");
    expect(exportRes.status).toBe(401);
  });

  it("previews a CSV import with a valid/invalid row breakdown", async () => {
    const cookie = await signIn("importer@x.com");
    const res = await postJson("/api/import/preview", { format: "csv", content: SAMPLE_CSV }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.validCount).toBe(2);
    expect(body.errorCount).toBe(1);
    expect(body.rows.length).toBe(3);
    const invalidRow = body.rows.find((r: any) => r.input === null);
    expect(invalidRow.errors.length).toBeGreaterThan(0);
  });

  it("commits a CSV import, skipping invalid rows, and lists them in the collection", async () => {
    const cookie = await signIn("committer@x.com");
    const res = await postJson("/api/import/commit", { format: "csv", content: SAMPLE_CSV }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(1);

    const listRes = await call("/api/collection", undefined, cookie);
    const listBody = (await listRes.json()) as any;
    expect(listBody.total).toBe(2);
    const blaze = listBody.items.find((i: any) => i.nickname === "Blaze");
    expect(blaze).toBeTruthy();
    expect(blaze.isShiny).toBe(1);
    expect(blaze.level).toBe(100);
    expect(blaze.source).toBe("csv");
  });

  it("exports the user's specimens as re-importable JSON (round-trip)", async () => {
    const cookie = await signIn("roundtripper@x.com");
    await postJson("/api/import/commit", { format: "csv", content: SAMPLE_CSV }, cookie);

    const exportRes = await call("/api/export", undefined, cookie);
    expect(exportRes.status).toBe(200);
    const exportBody = (await exportRes.json()) as any;
    expect(exportBody.count).toBe(2);
    expect(exportBody.specimens.length).toBe(2);

    const reimportContent = JSON.stringify(exportBody);
    const previewRes = await postJson("/api/import/preview", { format: "json", content: reimportContent }, cookie);
    const previewBody = (await previewRes.json()) as any;
    expect(previewBody.validCount).toBe(2);
    expect(previewBody.errorCount).toBe(0);

    const commitRes = await postJson("/api/import/commit", { format: "json", content: reimportContent }, cookie);
    const commitBody = (await commitRes.json()) as any;
    expect(commitBody.created).toBe(2);
    expect(commitBody.skipped).toBe(0);

    const listRes = await call("/api/collection?limit=200", undefined, cookie);
    const listBody = (await listRes.json()) as any;
    expect(listBody.total).toBe(4);
    expect(listBody.items.filter((i: any) => i.source === "json").length).toBe(2);
  });
});
