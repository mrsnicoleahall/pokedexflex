import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values([
    { id: 1, name: "bulbasaur", generation: 1, types: JSON.stringify(["grass", "poison"]), spriteUrl: null },
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

  it("commits a large import in chunks past the SQLite bound-variable limit", async () => {
    const cookie = await signIn("bulkimporter@x.com");
    const specimensToImport = Array.from({ length: 120 }, (_, i) => ({
      speciesId: [1, 6, 25][i % 3],
      nickname: `Mon${i}`,
      isShiny: 0,
    }));
    const res = await postJson(
      "/api/import/commit",
      { format: "json", content: JSON.stringify({ specimens: specimensToImport }) },
      cookie,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.created).toBe(120);
    expect(body.skipped).toBe(0);

    const listRes = await call("/api/collection?limit=200", undefined, cookie);
    const listBody = (await listRes.json()) as any;
    expect(listBody.total).toBe(120);
  });

  it("previews and commits a JSON import in the {catalogue:[...]} automator shape", async () => {
    const cookie = await signIn("catalogueimporter@x.com");
    const content = JSON.stringify({
      catalogue: [
        {
          dex: 1,
          name: "bulbasaur",
          shiny: true,
          nature: "Bold",
          ball: "poke-ball",
          moves: ["tackle", "growl"],
          ot_name: "cole",
          ot_id: 57962,
          gender: "Male",
          held_item_slug: "none",
          iv_perfect: true,
        },
      ],
    });

    const previewRes = await postJson("/api/import/preview", { format: "json", content }, cookie);
    expect(previewRes.status).toBe(200);
    const previewBody = (await previewRes.json()) as any;
    expect(previewBody.validCount).toBe(1);
    const row = previewBody.rows[0];
    expect(row.input.speciesId).toBe(1);
    expect(row.input.isShiny).toBe(1);
    expect(row.input.nature).toBe("Bold");
    expect(row.input.ball).toBe("poke-ball");
    expect(row.input.otName).toBe("cole");
    expect(row.input.otId).toBe("57962");
    expect(row.input.gender).toBe("male");
    expect(row.input.moves.length).toBe(2);
    expect(row.input.ivs).toEqual({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });

    const commitRes = await postJson("/api/import/commit", { format: "json", content }, cookie);
    expect(commitRes.status).toBe(200);
    const commitBody = (await commitRes.json()) as any;
    expect(commitBody.created).toBe(1);
  });
});
