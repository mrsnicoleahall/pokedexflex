import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../../src/worker/index";

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
const putJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);

const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = `/api/auth/verify?token=${new URL(devLink).searchParams.get("token")}`;
  const verify = await call(path, { redirect: "manual" } as any);
  return verify.headers.get("set-cookie")!.split(";")[0];
};
const makeTrainer = async (email: string, handle: string, name: string): Promise<string> => {
  const cookie = await signIn(email);
  await putJson("/api/profile", { displayName: name, gender: "boy" }, cookie);
  await putJson("/api/profile/handle", { handle }, cookie);
  return cookie;
};

describe("/api/rivalries", () => {
  it("rejects list/save/delete when not signed in (401)", async () => {
    expect((await call("/api/rivalries")).status).toBe(401);
    expect((await postJson("/api/rivalries", { handle: "whoever" })).status).toBe(401);
    expect((await call("/api/rivalries/whatever", { method: "DELETE" })).status).toBe(401);
  });

  it("saves a rivalry by handle, lists it, then deletes it", async () => {
    const me = await makeTrainer("riv-me@x.com", "riv-me", "Me");
    await makeTrainer("riv-rival@x.com", "riv-rival", "Rival");

    const saved = await postJson("/api/rivalries", { handle: "riv-rival" }, me);
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as any;
    expect(savedBody.rivalries).toHaveLength(1);
    expect(savedBody.rivalries[0].handle).toBe("riv-rival");
    expect(savedBody.rivalries[0].displayName).toBe("Rival");

    const list = await call("/api/rivalries", undefined, me);
    const listBody = (await list.json()) as any;
    expect(listBody.rivalries).toHaveLength(1);

    const id = listBody.rivalries[0].id;
    const del = await call(`/api/rivalries/${id}`, { method: "DELETE" }, me);
    expect(del.status).toBe(200);
    const after = await call("/api/rivalries", undefined, me);
    expect(((await after.json()) as any).rivalries).toHaveLength(0);
  });

  it("404s saving an unknown or private opponent (indistinguishable)", async () => {
    const me = await makeTrainer("riv-me2@x.com", "riv-me2", "Me2");
    const unknown = await postJson("/api/rivalries", { handle: "riv-nobody" }, me);
    expect(unknown.status).toBe(404);

    const ghost = await makeTrainer("riv-ghost@x.com", "riv-ghost", "Ghost");
    await putJson("/api/profile/visibility", { isPublic: false }, ghost);
    const priv = await postJson("/api/rivalries", { handle: "riv-ghost" }, me);
    expect(priv.status).toBe(404);
  });

  it("rejects rivaling yourself (400)", async () => {
    const me = await makeTrainer("riv-self@x.com", "riv-self", "Self");
    const res = await postJson("/api/rivalries", { handle: "riv-self" }, me);
    expect(res.status).toBe(400);
  });
});

describe("/api/rivalries account-deletion cascade", () => {
  it("removes rivalries where the deleted user is owner or opponent", async () => {
    const a = await makeTrainer("riv-del-a@x.com", "riv-del-a", "DelA");
    const b = await makeTrainer("riv-del-b@x.com", "riv-del-b", "DelB");
    // a saves b, and b saves a — so a appears as owner (a's row) and opponent (b's row)
    await postJson("/api/rivalries", { handle: "riv-del-b" }, a);
    await postJson("/api/rivalries", { handle: "riv-del-a" }, b);

    // delete a's account
    const del = await call("/api/auth/account", { method: "DELETE" }, a);
    expect(del.status).toBe(200);

    // b's list no longer references the deleted user
    const list = await call("/api/rivalries", undefined, b);
    expect(((await list.json()) as any).rivalries).toHaveLength(0);
  });
});
