import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(users).values([
    // Wall owner (public). Its email lets signIn() resolve to THIS user.
    { id: "wall-gary", email: "wallgary@x.com", handle: "wallgary", displayName: "Gary", isPublic: 1, createdAt: 1 },
    // Private profile — its wall must 404 like the profile does.
    { id: "wall-priv", email: "wallpriv@x.com", handle: "wallpriv", displayName: "Priv", isPublic: 0, createdAt: 1 },
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

const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const verify = await call(
    `/api/auth/verify?token=${new URL(devLink).searchParams.get("token")}`,
    { redirect: "manual" } as any,
  );
  return verify.headers.get("set-cookie")!.split(";")[0];
};

describe("trainer wall API", () => {
  it("posts, lists newest-first, flags canDelete, enforces delete auth, and 404s private walls", async () => {
    const author = await signIn("wall-author@x.com");
    const stranger = await signIn("wall-stranger@x.com");
    const owner = await signIn("wallgary@x.com"); // resolves to seeded wall-gary

    expect((await postJson("/api/wall/wallgary", { body: "first post gg" }, author)).status).toBe(200);
    expect((await postJson("/api/wall/wallgary", { body: "second post" }, author)).status).toBe(200);

    // Public (no cookie): posts visible, nothing deletable.
    const pub = (await (await call("/api/wall/wallgary")).json()) as any;
    expect(pub.posts).toHaveLength(2);
    expect(pub.posts[0].body).toBe("second post"); // newest first
    expect(pub.posts.every((p: any) => p.canDelete === false)).toBe(true);
    expect(pub.isOwner).toBe(false);

    // Author sees canDelete on their posts.
    const asAuthor = (await (await call("/api/wall/wallgary", undefined, author)).json()) as any;
    expect(asAuthor.posts.every((p: any) => p.canDelete)).toBe(true);

    // Wall owner sees isOwner + canDelete on everything.
    const asOwner = (await (await call("/api/wall/wallgary", undefined, owner)).json()) as any;
    expect(asOwner.isOwner).toBe(true);
    expect(asOwner.posts.every((p: any) => p.canDelete)).toBe(true);

    // A stranger cannot delete someone else's post on someone else's wall.
    const postId = pub.posts[0].id;
    expect((await call(`/api/wall/post/${postId}`, { method: "DELETE" }, stranger)).status).toBe(403);

    // The wall owner can delete it.
    expect((await call(`/api/wall/post/${postId}`, { method: "DELETE" }, owner)).status).toBe(200);
    const after = (await (await call("/api/wall/wallgary")).json()) as any;
    expect(after.posts).toHaveLength(1);

    // Posting to a private profile's wall 404s (same opacity as the profile).
    expect((await postJson("/api/wall/wallpriv", { body: "hi" }, author)).status).toBe(404);
    expect((await call("/api/wall/wallpriv")).status).toBe(404);
  });

  it("requires sign-in to post and rejects an empty body", async () => {
    expect((await postJson("/api/wall/wallgary", { body: "nope" })).status).toBe(401);
    const author = await signIn("wall-author2@x.com");
    expect((await postJson("/api/wall/wallgary", { body: "   " }, author)).status).toBe(400);
  });
});
