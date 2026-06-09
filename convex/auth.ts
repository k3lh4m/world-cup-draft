import { convexAuth } from "@convex-dev/auth/server";
import Email from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";

import { buildMagicLinkEmail, sendMailerSendEmail } from "./lib/mailerSend";

// Custom magic-link provider sending via MailerSend's REST API.
// `Email({ authorize: undefined })` is @convex-dev/auth's documented magic-link
// shape (token alone is sufficient); we override `id`/`from` on the returned
// config. Reads MAILERSEND_API_KEY and MAILERSEND_FROM from the deployment env.
const MailerSend = {
  ...Email({
    authorize: undefined,
    sendVerificationRequest: async (params) => {
      const { identifier: to, url, provider } = params;
      const apiKey = process.env.MAILERSEND_API_KEY;
      if (!apiKey) {
        throw new Error("MAILERSEND_API_KEY is not set");
      }
      const payload = buildMagicLinkEmail({ to, url, from: provider.from });
      await sendMailerSendEmail({ apiKey, payload });
    },
  }),
  id: "mailersend",
  from: process.env.MAILERSEND_FROM ?? "World Cup Draft <onboarding@resend.dev>",
  maxAge: 24 * 60 * 60, // magic link valid 24h (matches prior Resend behaviour)
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    MailerSend,
    // Email + password for creating test accounts without sending email.
    Password(),
  ],
});
