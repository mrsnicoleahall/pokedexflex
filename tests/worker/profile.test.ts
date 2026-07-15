import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values([
    { id: 6001, name: "favroutea", generation: 1, types: JSON.stringify(["water"]), homeId: 6001 },
    { id: 6002, name: "favrouteb", generation: 1, types: JSON.stringify(["grass"]), homeId: null },
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

const putJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);

const postAvatar = async (path: string, bytes: Uint8Array, type: string, cookie?: string) => {
  const form = new FormData();
  form.set("avatar", new Blob([bytes], { type }), "avatar.png");
  const ctx = createExecutionContext();
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { method: "POST", headers, body: form }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

/** Runs the real magic-link flow and returns the session cookie string for `email`. */
const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
};

describe("PUT /api/profile", () => {
  it("rejects when not signed in (401)", async () => {
    const res = await putJson("/api/profile", { displayName: "Ash", gender: "boy" });
    expect(res.status).toBe(401);
  });

  it("sets displayName + gender, and they persist on the next /me fetch", async () => {
    const cookie = await signIn("profile-set@x.com");
    const res = await putJson("/api/profile", { displayName: "Ash", gender: "boy" }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.displayName).toBe("Ash");
    expect(body.user.gender).toBe("boy");
    expect(body.user.email).toBe("profile-set@x.com");
    expect(body.user.favorites).toEqual([]);

    const me = await call("/api/auth/me", undefined, cookie);
    const meBody = (await me.json()) as any;
    expect(meBody.user.displayName).toBe("Ash");
    expect(meBody.user.gender).toBe("boy");
  });

  it("includes the user's enriched favorites in the response, matching /me", async () => {
    const cookie = await signIn("profile-withfavs@x.com");
    await putJson("/api/profile/favorites", { speciesIds: [6001, 6002] }, cookie);

    const res = await putJson("/api/profile", { displayName: "Brock" }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.favorites).toEqual([
      { speciesId: 6001, name: "favroutea", homeId: 6001 },
      { speciesId: 6002, name: "favrouteb", homeId: null },
    ]);

    const me = await call("/api/auth/me", undefined, cookie);
    expect(((await me.json()) as any).user.favorites).toEqual(body.user.favorites);
  });

  it("supports a partial update without clobbering the other field", async () => {
    const cookie = await signIn("profile-partial@x.com");
    await putJson("/api/profile", { displayName: "Misty", gender: "girl" }, cookie);
    await putJson("/api/profile", { gender: "ditto" }, cookie);

    const me = await call("/api/auth/me", undefined, cookie);
    const body = (await me.json()) as any;
    expect(body.user.displayName).toBe("Misty"); // untouched by the gender-only update
    expect(body.user.gender).toBe("ditto");
  });

  it("rejects an invalid gender (400) and does not persist it", async () => {
    const cookie = await signIn("profile-badgender@x.com");
    const res = await putJson("/api/profile", { displayName: "Ash", gender: "robot" }, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/boy, girl, ditto/);

    const me = await call("/api/auth/me", undefined, cookie);
    expect((await me.json() as any).user.gender).toBeNull();
  });

  it("rejects an empty displayName (400)", async () => {
    const cookie = await signIn("profile-emptyname@x.com");
    const res = await putJson("/api/profile", { displayName: "   " }, cookie);
    expect(res.status).toBe(400);
  });

  it("rejects a body with neither field (400 'nothing to update')", async () => {
    const cookie = await signIn("profile-empty@x.com");
    const res = await putJson("/api/profile", {}, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/nothing to update/);
  });
});

describe("avatar upload/serve", () => {
  it("rejects upload when not signed in (401)", async () => {
    const res = await postAvatar("/api/profile/avatar", FAKE_PNG, "image/png");
    expect(res.status).toBe(401);
  });

  it("rejects a disallowed content type (400)", async () => {
    const cookie = await signIn("avatar-badtype@x.com");
    const res = await postAvatar("/api/profile/avatar", new Uint8Array([1, 2, 3]), "text/plain", cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/unsupported/);
  });

  it("rejects a file over the 2 MiB cap (400)", async () => {
    const cookie = await signIn("avatar-toobig@x.com");
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    const res = await postAvatar("/api/profile/avatar", big, "image/png", cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/too large/);
  });

  it("404s a userId with no avatar", async () => {
    const res = await call("/api/profile/avatar/no-such-user");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("uploads a valid image, flips hasAvatar, and serves the same bytes+type back — publicly, no cookie needed", async () => {
    const cookie = await signIn("avatar-owner@x.com");
    const me1 = await call("/api/auth/me", undefined, cookie);
    const userId = ((await me1.json()) as any).user.id;

    const upload = await postAvatar("/api/profile/avatar", FAKE_PNG, "image/png", cookie);
    expect(upload.status).toBe(200);
    expect((await upload.json()) as any).toEqual({ hasAvatar: true });

    const me2 = await call("/api/auth/me", undefined, cookie);
    expect(((await me2.json()) as any).user.hasAvatar).toBe(true);

    const served = await call(`/api/profile/avatar/${userId}`); // no cookie — public read
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await served.arrayBuffer());
    expect(bytes).toEqual(FAKE_PNG);
  });

  it("re-uploading replaces the avatar at the same key rather than accumulating objects", async () => {
    const cookie = await signIn("avatar-replace@x.com");
    const me1 = await call("/api/auth/me", undefined, cookie);
    const userId = ((await me1.json()) as any).user.id;

    await postAvatar("/api/profile/avatar", FAKE_PNG, "image/png", cookie);
    const second = new Uint8Array([9, 9, 9]);
    await postAvatar("/api/profile/avatar", second, "image/jpeg", cookie);

    const served = await call(`/api/profile/avatar/${userId}`);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(second);
  });
});

describe("PUT /api/profile/favorites", () => {
  it("rejects when not signed in (401)", async () => {
    const res = await putJson("/api/profile/favorites", { speciesIds: [] });
    expect(res.status).toBe(401);
  });

  it("pins up to 3 valid species and reflects them, enriched, on the response and on /me", async () => {
    const cookie = await signIn("fav-owner@x.com");
    const res = await putJson("/api/profile/favorites", { speciesIds: [6001, 6002] }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.favorites).toEqual([
      { speciesId: 6001, name: "favroutea", homeId: 6001 },
      { speciesId: 6002, name: "favrouteb", homeId: null },
    ]);

    const me = await call("/api/auth/me", undefined, cookie);
    expect(((await me.json()) as any).user.favorites).toEqual(body.favorites);
  });

  it("rejects an unknown species id (400)", async () => {
    const cookie = await signIn("fav-unknown@x.com");
    const res = await putJson("/api/profile/favorites", { speciesIds: [999999] }, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/unknown species/);
  });

  it("rejects more than 3 species ids (400)", async () => {
    const cookie = await signIn("fav-overflow@x.com");
    const res = await putJson("/api/profile/favorites", { speciesIds: [6001, 6002, 6001, 6002] }, cookie);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/me favorites default", () => {
  it("is an empty array for a user who hasn't picked any favorites", async () => {
    const cookie = await signIn("fav-none@x.com");
    const me = await call("/api/auth/me", undefined, cookie);
    expect(((await me.json()) as any).user.favorites).toEqual([]);
  });
});
