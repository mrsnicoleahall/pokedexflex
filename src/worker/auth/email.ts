export type ContactMessage = {
  /** Admin recipient. */
  to: string;
  /** The sender's email, set as reply-to so the admin can just hit reply. */
  replyTo: string;
  /** The sender's trainer name (or null). */
  replyName: string | null;
  /** The message body. */
  message: string;
};

export interface EmailSender {
  sendLoginLink(email: string, link: string): Promise<{ devLink?: string }>;
  sendContactMessage(msg: ContactMessage): Promise<void>;
}

export class DevEmailSender implements EmailSender {
  async sendLoginLink(email: string, link: string): Promise<{ devLink?: string }> {
    console.log(`[dev email] login link for ${email}: ${link}`);
    return { devLink: link };
  }

  async sendContactMessage(msg: ContactMessage): Promise<void> {
    console.log(`[dev email] contact → ${msg.to} (reply-to ${msg.replyTo}): ${msg.message}`);
  }
}

/**
 * Resend-backed sender. Checks the API response and throws on failure so a
 * rejected send (e.g. an unverified `from` domain) surfaces in logs and to the
 * caller instead of failing silently. `from` is configurable via EMAIL_FROM.
 */
class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendLoginLink(email: string, link: string): Promise<{ devLink?: string }> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [email],
        subject: "Your PokéDexFlex login link",
        text: `Sign in to PokéDexFlex: ${link}\n\nThis link expires in 15 minutes.`,
        html: `<p>Sign in to <strong>PokéDexFlex</strong>:</p><p><a href="${link}">${link}</a></p><p>This link expires in 15 minutes.</p>`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Log for `wrangler tail`; throw so /request-link returns an error rather than a false success.
      console.error(`Resend send failed (${res.status}) from "${this.from}" to "${email}": ${detail}`);
      throw new Error(`email_send_failed: Resend returned ${res.status}`);
    }
    return {};
  }

  async sendContactMessage(msg: ContactMessage): Promise<void> {
    const who = msg.replyName ? `${msg.replyName} <${msg.replyTo}>` : msg.replyTo;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        reply_to: msg.replyTo,
        subject: `PokéDexFlex contact from ${who}`,
        text: `From: ${who}\n\n${msg.message}`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Resend contact send failed (${res.status}) to "${msg.to}": ${detail}`);
      throw new Error(`email_send_failed: Resend returned ${res.status}`);
    }
  }
}

type EmailEnv = { RESEND_API_KEY?: string; EMAIL_FROM?: string };

/**
 * Returns DevEmailSender (returns the link in the API response, for local dev)
 * unless RESEND_API_KEY is set. The `from` address defaults to Resend's
 * no-setup `onboarding@resend.dev` — which works without domain verification
 * but only delivers to your own Resend account email. Once you verify
 * pokedexflex.com in Resend, set EMAIL_FROM="PokeDexFlex <login@pokedexflex.com>".
 */
export const getEmailSender = (env: Env): EmailSender => {
  const e = env as unknown as EmailEnv;
  if (!e.RESEND_API_KEY) return new DevEmailSender();
  const from = e.EMAIL_FROM ?? "PokéDexFlex <onboarding@resend.dev>";
  return new ResendEmailSender(e.RESEND_API_KEY, from);
};
