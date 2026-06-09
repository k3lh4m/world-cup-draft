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
