import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values({
    id: 25,
    name: "pikachu",
    generation: 1,
    types: JSON.stringify(["electric"]),
    spriteUrl: null,
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

const patchJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);

/** Runs the real magic-link flow and returns the session cookie string for `email`. */
const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
};

describe("boxes API", () => {
  it("rejects unauthenticated GET with 401", async () => {
    const res = await call("/api/boxes");
    expect(res.status).toBe(401);
  });

  it("creates, lists, fills, renames, and deletes a box without deleting specimens", async () => {
    const cookie = await signIn("boxer@x.com");

    // create
    const created = (await (await postJson("/api/boxes", { name: "Box 1" }, cookie)).json()) as any;
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Box 1");
    expect(created.count).toBe(0);

    // list shows count 0
    const list1 = (await (await call("/api/boxes", undefined, cookie)).json()) as any;
    const found1 = list1.boxes.find((b: any) => b.id === created.id);
    expect(found1).toBeTruthy();
    expect(found1.count).toBe(0);

    // add a specimen into the box
    const specimen = (await (
      await postJson("/api/collection", { speciesId: 25, nickname: "Sparky", boxId: created.id }, cookie)
    ).json()) as any;
    expect(specimen.boxId).toBe(created.id);

    // list shows count 1
    const list2 = (await (await call("/api/boxes", undefined, cookie)).json()) as any;
    const found2 = list2.boxes.find((b: any) => b.id === created.id);
    expect(found2.count).toBe(1);

    // rename
    const renamed = (await (await patchJson(`/api/boxes/${created.id}`, { name: "Renamed Box" }, cookie)).json()) as any;
    expect(renamed.name).toBe("Renamed Box");

    // delete box
    const deleteRes = await call(`/api/boxes/${created.id}`, { method: "DELETE" }, cookie);
    expect(deleteRes.status).toBe(200);
    expect(((await deleteRes.json()) as any).ok).toBe(true);

    // box gone from list
    const list3 = (await (await call("/api/boxes", undefined, cookie)).json()) as any;
    expect(list3.boxes.find((b: any) => b.id === created.id)).toBeFalsy();

    // specimen still exists, boxId now null
    const stillThere = (await (await call(`/api/collection/${specimen.id}`, undefined, cookie)).json()) as any;
    expect(stillThere.boxId).toBe(null);
  });

  it("rejects an empty name with 400", async () => {
    const cookie = await signIn("emptyname@x.com");
    const res = await postJson("/api/boxes", { name: "   " }, cookie);
    expect(res.status).toBe(400);
  });

  it("404s on PATCH/DELETE for a foreign or unknown box id", async () => {
    const ownerCookie = await signIn("boxowner@x.com");
    const intruderCookie = await signIn("boxintruder@x.com");
    const box = (await (await postJson("/api/boxes", { name: "Owner box" }, ownerCookie)).json()) as any;

    const patchRes = await patchJson(`/api/boxes/${box.id}`, { name: "Stolen" }, intruderCookie);
    expect(patchRes.status).toBe(404);

    const deleteRes = await call(`/api/boxes/${box.id}`, { method: "DELETE" }, intruderCookie);
    expect(deleteRes.status).toBe(404);

    const unknownPatch = await patchJson("/api/boxes/does-not-exist", { name: "X" }, ownerCookie);
    expect(unknownPatch.status).toBe(404);

    const unknownDelete = await call("/api/boxes/does-not-exist", { method: "DELETE" }, ownerCookie);
    expect(unknownDelete.status).toBe(404);
  });
});
