import { z } from "zod";

export const FromAddressSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
});
export type FromAddress = z.infer<typeof FromAddressSchema>;

/** Parse an Auth.js `from` string: `"Name <addr@domain>"` or a bare `"addr@domain"`. */
export function parseFrom(from: string): FromAddress {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    return name ? { name, email } : { email };
  }
  return { email: from.trim() };
}

export const MailerSendPayloadSchema = z.object({
  from: FromAddressSchema,
  to: z.array(FromAddressSchema),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
});
export type MailerSendPayload = z.infer<typeof MailerSendPayloadSchema>;

const SUBJECT = "Sign in to World Cup Draft";

/** Build the MailerSend request body for a magic-link sign-in email. */
export function buildMagicLinkEmail(args: { to: string; url: string; from: string }): MailerSendPayload {
  const { to, url, from } = args;
  return {
    from: parseFrom(from),
    to: [{ email: to }],
    subject: SUBJECT,
    html:
      `<p>Click the link below to sign in to World Cup Draft.</p>` +
      `<p><a href="${url}">Sign in to World Cup Draft</a></p>` +
      `<p>If you didn't request this, you can ignore this email.</p>`,
    text: `Sign in to World Cup Draft:\n${url}\n\nIf you didn't request this, ignore this email.`,
  };
}
