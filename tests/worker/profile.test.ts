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

    const me = await call("/api/auth/me", undefined, cookie);
    const meBody = (await me.json()) as any;
    expect(meBody.user.displayName).toBe("Ash");
    expect(meBody.user.gender).toBe("boy");
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
