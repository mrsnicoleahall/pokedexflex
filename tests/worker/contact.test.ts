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

const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const verify = await call(
    `/api/auth/verify?token=${new URL(devLink).searchParams.get("token")}`,
    { redirect: "manual" } as any,
  );
  return verify.headers.get("set-cookie")!.split(";")[0];
};

describe("contact API", () => {
  it("requires sign-in", async () => {
    const res = await postJson("/api/contact", { message: "hi" });
    expect(res.status).toBe(401);
  });

  it("rejects an empty message", async () => {
    const cookie = await signIn("contact-user@x.com");
    const res = await postJson("/api/contact", { message: "   " }, cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("message_required");
  });

  it("returns 503 when CONTACT_TO is not configured (no silent drop)", async () => {
    // The test env has no CONTACT_TO binding, so a valid message can't be
    // delivered — the route must say so rather than pretend it sent.
    const cookie = await signIn("contact-user2@x.com");
    const res = await postJson("/api/contact", { message: "real message" }, cookie);
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error).toBe("contact_not_configured");
  });
});
