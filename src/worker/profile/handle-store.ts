/**
 * Data-access helpers for public-profile handles (Flex Phase F): a
 * case-insensitive uniqueness check and a unique-handle generator used to
 * backfill a handle at onboarding. All D1 I/O lives here; the pure format
 * rules live in `./handle`. `routes/profile.ts` is the only caller.
 */
import { eq } from "drizzle-orm";
import type { getDb } from "../db";
import { users } from "../../db/schema";
import { normalizeHandle, validateHandle } from "./handle";

type Db = ReturnType<typeof getDb>;

/**
 * True if `handle` (normalized) already belongs to some user other than
 * `exceptUserId`. Case-insensitive by construction: handles are always
 * stored normalized (lowercased), so a plain equality on the normalized
 * candidate is a case-insensitive match.
 */
export async function isHandleTaken(db: Db, handle: string, exceptUserId?: string): Promise<boolean> {
  const normalized = normalizeHandle(handle);
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, normalized))
    .limit(2);
  return rows.some((r) => r.id !== exceptUserId);
}

/**
 * Returns a unique, valid handle derived from `base`: tries the base itself,
 * then `base-2`, `base-3`, … until one is free. `base` is expected to come
 * from `suggestHandleBase` (already valid); any candidate that would fail
 * `validateHandle` (e.g. length overflow from the suffix) is skipped. Falls
 * back to a random suffix in the pathological case that nothing else is free.
 */
export async function generateUniqueHandle(db: Db, base: string): Promise<string> {
  const root = validateHandle(base).ok ? normalizeHandle(base) : "trainer";
  for (let n = 1; n <= 1000; n++) {
    const candidate = n === 1 ? root : `${root.slice(0, 27)}-${n}`;
    const v = validateHandle(candidate);
    if (!v.ok) continue;
    if (!(await isHandleTaken(db, v.value))) return v.value;
  }
  return `trainer-${crypto.randomUUID().slice(0, 8)}`;
}
