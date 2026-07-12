import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "../../src/worker/auth/tokens";
import { createSession, getSession, deleteSession } from "../../src/worker/auth/session";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";

describe("auth helpers", () => {
  it("token is random hex and hash is stable", async () => {
    const a = generateToken(), b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/); expect(a).not.toBe(b);
    expect(await hashToken(a)).toBe(await hashToken(a));
    expect(await hashToken(a)).not.toBe(await hashToken(b));
  });
  it("session lifecycle", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "u1", email: "a@b.com", createdAt: 1 });
    const sid = await createSession(db, "u1");
    expect((await getSession(db, sid))?.userId).toBe("u1");
    await deleteSession(db, sid);
    expect(await getSession(db, sid)).toBeNull();
  });
});
