export interface EmailSender {
  sendLoginLink(email: string, link: string): Promise<{ devLink?: string }>;
}

export class DevEmailSender implements EmailSender {
  async sendLoginLink(email: string, link: string): Promise<{ devLink?: string }> {
    console.log(`[dev email] login link for ${email}: ${link}`);
    return { devLink: link };
  }
}

/** Minimal Resend-backed sender. Optional/untested — real routing is not yet exercised locally. */
class ResendEmailSender implements EmailSender {
  constructor(private readonly apiKey: string) {}

  async sendLoginLink(email: string, link: string): Promise<{ devLink?: string }> {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PokeFlexDex <login@pokeflexdex.example>",
        to: [email],
        subject: "Your PokeFlexDex login link",
        text: `Sign in: ${link}`,
      }),
    });
    return {};
  }
}

type EmailEnv = { RESEND_API_KEY?: string };

/** Returns DevEmailSender unless a real provider env var (e.g. RESEND_API_KEY) is set. */
export const getEmailSender = (env: Env): EmailSender => {
  const apiKey = (env as unknown as EmailEnv).RESEND_API_KEY;
  return apiKey ? new ResendEmailSender(apiKey) : new DevEmailSender();
};
