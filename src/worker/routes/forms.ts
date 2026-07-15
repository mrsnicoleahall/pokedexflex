import { Hono } from "hono";
import { and, eq, isNotNull } from "drizzle-orm";
import { forms, specimens } from "../../db/schema";
import { getDb } from "../db";
import { getCurrentUser } from "../auth/current-user";

export const formsRoutes = new Hono<{ Bindings: Env }>();

/** Strip a PokeAPI sprite URL down to its filename stem ("…/201-b.png" → "201-b"). */
const slugFromUrl = (url: string | null): string | null => {
  if (!url) return null;
  const base = url.split("/").pop();
  if (!base) return null;
  return base.endsWith(".png") ? base.slice(0, -4) : base;
};

// GET /api/forms — the whole alternate-form catalog for the Forms gallery.
// Grouping, display names, and acquisition copy are derived client-side from
// the raw rows (see formsDisplay.ts). `owned` is populated only when signed in;
// a form is owned when the trainer has any specimen linked to that form id.
formsRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      formId: forms.id,
      speciesId: forms.speciesId,
      name: forms.name,
      formType: forms.formType,
      homeId: forms.homeId,
      spriteUrl: forms.spriteUrl,
    })
    .from(forms);

  const user = await getCurrentUser(c);
  const ownedFormIds = new Set<number>();
  if (user) {
    const owned = await db
      .selectDistinct({ formId: specimens.formId })
      .from(specimens)
      .where(and(eq(specimens.userId, user.id), isNotNull(specimens.formId)));
    for (const o of owned) if (o.formId !== null) ownedFormIds.add(o.formId);
  }

  const items = rows.map((r) => ({
    formId: r.formId,
    speciesId: r.speciesId,
    name: r.name,
    formType: r.formType,
    homeId: r.homeId,
    slug: slugFromUrl(r.spriteUrl),
    owned: ownedFormIds.has(r.formId),
  }));

  return c.json({ forms: items });
});
