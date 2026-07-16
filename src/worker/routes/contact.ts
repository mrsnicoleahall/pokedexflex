import { Hono } from "hono";
import { requireUser } from "../auth/current-user";
import { getEmailSender } from "../auth/email";

export const contactRoutes = new Hono<{ Bindings: Env }>();

const MESSAGE_MAX = 4000;

// POST /api/contact { message } — emails the admin (CONTACT_TO) with the
// signed-in trainer's message, reply-to set to their email. Sign-in-gated to
// keep spam down; message length is bounded.
contactRoutes.post("/", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<{ message?: string }>().catch(() => ({}) as { message?: string });
  const message = (body.message ?? "").trim();
  if (!message) return c.json({ error: "message_required" }, 400);
  if (message.length > MESSAGE_MAX) return c.json({ error: "message_too_long" }, 400);

  const adminEmail = (c.env as unknown as { CONTACT_TO?: string }).CONTACT_TO?.trim();
  if (!adminEmail) {
    console.error("contact: CONTACT_TO is not set; cannot deliver message from", user.email);
    return c.json({ error: "contact_not_configured" }, 503);
  }

  await getEmailSender(c.env).sendContactMessage({
    to: adminEmail,
    replyTo: user.email,
    replyName: user.displayName,
    message,
  });
  return c.json({ ok: true });
});
