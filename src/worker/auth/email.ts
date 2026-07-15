export interface EmailSender {
  sendLoginLink(email: string, link: string): Promise<{ devLink?: string }>;
}

export class DevEmailSender implements EmailSender {
  async sendLoginLink(email: string, link: string): Promise<{ devLink?: string }> {
    console.log(`[dev email] login link for ${email}: ${link}`);
    return { devLink: link };
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
