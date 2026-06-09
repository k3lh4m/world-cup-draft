# Design: Swap Resend → MailerSend for magic-link auth email

**Date:** 2026-06-09
**Branch:** `mailersend-auth`
**Status:** Approved design, pending spec review

## Problem

Magic-link sign-in emails are sent via Auth.js's built-in Resend provider
(`@auth/core/providers/resend`) in `convex/auth.ts`. Resend's free tier allows only
**one** verified sending domain, and the account's single domain slot is already in
active use. Adding a second sending domain (even a subdomain) requires Resend Pro at
$20/month — not justified for a hobby project.

MailerSend's free tier (3,000 emails/month) lets us verify a domain the user already owns
(`kelham.co`) at no cost. We switch the email transport from Resend to MailerSend.

### Domain decision

MailerSend's free **Trial** plan turned out to allow only **one** custom domain (a
separate subdomain like `worldcupdraft.kelham.co` requires the paid Starter plan). The
user's `kelham.co` is already verified on the account, so we send from **`kelham.co`
directly** (`magic@kelham.co`). A dedicated subdomain (for sending-reputation isolation
from personal `sam@kelham.co` mail) would need a plan upgrade or deleting+re-adding the
domain — not worth it at hobby volume. This is purely the `MAILERSEND_FROM` value; moving
to a subdomain later requires no code change.

## Scope

**In scope:** Replace the Resend email transport with a MailerSend transport for the
magic-link flow. Pure transport swap.

**Explicitly unchanged:**
- The magic-link flow, token generation, expiry, and single-use semantics — all owned by
  `@convex-dev/auth` / Auth.js, untouched.
- The `Password()` provider in `convex/auth.ts` (email+password test accounts).
- The `signIn("password", …)` call path in `components/SignIn.tsx` (line ~73).
- Sign-in UX / card layout.

## Current state (verified on branch HEAD)

- `convex/auth.ts` — `convexAuth({ providers: [ Resend({ from: "World Cup Draft <onboarding@resend.dev>" }), Password() ] })`. Resend reads `AUTH_RESEND_KEY`.
- `components/SignIn.tsx:55` — `await signIn("resend", formData)` (magic link).
- `components/SignIn.tsx:73` — `await signIn("password", formData)` (unchanged).
- `components/SignIn.test.tsx:25,32` — asserts the magic-link provider id is `"resend"`.
- External-fetch boundary pattern to follow: `convex/espn.ts` — inline Zod schema, pure
  helper extracted to `convex/lib/`, tested in `convex/tests/`.

## Architecture

Auth.js ships **no** MailerSend provider (Resend gets a first-class one; MailerSend does
not). The standard documented escape hatch is a custom email provider: a `type: "email"`
provider object with our own `sendVerificationRequest`, which POSTs to MailerSend's REST
API via `fetch`. No new npm dependency (just `fetch` + a Bearer token); no Node action
required (works in the default Convex runtime).

### Components

**1. `convex/lib/mailerSend.ts`** (new — the testable boundary)

- `parseFrom(from: string): { email: string; name?: string }`
  Parses Auth.js's `from` string. Accepts `"Display Name <addr@domain>"` → `{ name, email }`
  and bare `"addr@domain"` → `{ email }`.

- `buildMagicLinkEmail({ to, url, from }): MailerSendPayload` — **pure function.**
  Returns the MailerSend request body: `{ from: parseFrom(from), to: [{ email: to }],
  subject, html, text }`. Both `html` and `text` embed the magic-link `url`. Subject e.g.
  "Sign in to World Cup Draft".

- `sendMailerSendEmail({ apiKey, payload }): Promise<{ messageId?: string }>`
  `POST https://api.mailersend.com/v1/email` with headers
  `Authorization: Bearer <apiKey>`, `Content-Type: application/json`,
  `Accept: application/json`, body = JSON payload.
  - **Success: HTTP 202 Accepted with empty body** (message id in the `x-message-id`
    response header). Resolve, returning `{ messageId }`.
  - **Failure: non-2xx.** MailerSend returns a JSON error body
    `{ message: string, errors?: Record<string, string[]> }`. Zod-parse it (boundary
    validation per AGENTS.md), then throw an `Error` carrying `message` + status. If the
    body is missing/unparseable, throw a fallback error with the status code.

Zod schemas (`MailerSendErrorSchema`) defined inline in this module and exported with their
inferred types, per AGENTS.md.

**2. `convex/auth.ts`** (edit)

- Remove `import Resend from "@auth/core/providers/resend"`.
- Define a custom email provider:
  ```ts
  const MailerSend = {
    id: "mailersend",
    type: "email" as const,
    from: process.env.MAILERSEND_FROM ?? "World Cup Draft <onboarding@resend.dev>",
    async sendVerificationRequest({ identifier: to, url, provider }) {
      const apiKey = process.env.MAILERSEND_API_KEY;
      if (!apiKey) throw new Error("MAILERSEND_API_KEY is not set");
      const payload = buildMagicLinkEmail({ to, url, from: provider.from });
      await sendMailerSendEmail({ apiKey, payload });
    },
  };
  ```
  Keep `Password()` in the providers array.
- At implement time, confirm the exact provider shape `@convex-dev/auth@0.0.93` expects.
  If a plain `type: "email"` object isn't accepted directly, wrap it with
  `@convex-dev/auth/providers/Email`. Resolve by reading the installed package, not by
  guessing.

**3. `components/SignIn.tsx`** (edit)

- Line ~55: `signIn("resend", formData)` → `signIn("mailersend", formData)`. Nothing else.

### Data flow

User submits email → `signIn("mailersend", formData)` → `@convex-dev/auth` generates the
magic-link token + URL → our `sendVerificationRequest` builds the payload and POSTs to
MailerSend → MailerSend delivers from the verified subdomain → user clicks link → signed in.

## Environment variables

Set on the Convex deployment (e.g. `npx convex env set …`):

- `MAILERSEND_API_KEY` — MailerSend API token (replaces `AUTH_RESEND_KEY`).
- `MAILERSEND_FROM` — verified from-address: `World Cup Draft <magic@kelham.co>`
  (see "Domain decision"). Env-driven so the domain isn't hardcoded; falls back to the
  testing address if unset.

`AUTH_RESEND_KEY` becomes unused (left in place; removing it from the deployment is a
manual cleanup step, not code).

## Error handling

- Missing `MAILERSEND_API_KEY` → throw immediately (sign-in fails loudly, not silently).
- Non-2xx from MailerSend → Zod-parse error body, throw with MailerSend's `message` + status.
- Malformed/empty error body → throw a sensible fallback error with the status.

## Security considerations

(Per `security-implementation-review`, design stage.)

- **API key:** read only from `process.env.MAILERSEND_API_KEY` server-side in a Convex
  function; never returned to the client, never logged.
- **Token URL:** the magic-link `url` is a bearer credential. It is placed only into the
  outbound email body. It must **not** appear in thrown error messages or logs — error
  paths surface MailerSend's `message`/status only, never the payload.
- **Token lifecycle** (expiry, single-use, storage) is owned by `@convex-dev/auth` and is
  **not modified** by this transport swap — no new lifecycle/cleanup surface is introduced.
- **Fail-closed:** a failed send throws, so the user sees an error and can retry rather
  than believing a link was sent.

## Testing (TDD, test-first)

New: `convex/tests/mailerSend.test.ts`

1. `parseFrom` — `"Name <a@b.co>"` → `{ name: "Name", email: "a@b.co" }`; bare `"a@b.co"`
   → `{ email: "a@b.co" }`.
2. `buildMagicLinkEmail` — payload has parsed `from`, `to: [{ email }]`, a subject, and the
   `url` present in **both** `html` and `text`.
3. `sendMailerSendEmail` happy path — mocked `fetch` returns **202** with empty body and an
   `x-message-id` header → resolves with `{ messageId }`, and the request used Bearer auth +
   correct URL + JSON body.
4. `sendMailerSendEmail` error path — mocked `fetch` returns **422** with
   `{ message, errors }` → rejects, error message contains MailerSend's `message`.
5. `sendMailerSendEmail` malformed-error path — non-2xx with empty/garbage body → rejects
   with the fallback error (Zod parse guarded, no throw-on-parse leak).

Edit: `components/SignIn.test.tsx` — magic-link assertion `"resend"` → `"mailersend"`
(line ~25/32). The `"password"` assertions stay.

The provider wiring in `auth.ts` is configuration, covered by the lib tests plus a manual
end-to-end send once the key/domain are live.

## Manual verification (after user provides key + domain)

1. In MailerSend: `kelham.co` is already added and verified. Complete the account-approval
   questionnaire so the account can send to addresses other than the owner's. Generate an
   API token with email-sending permission.
2. `npx convex env set MAILERSEND_API_KEY <token>` and
   `npx convex env set MAILERSEND_FROM "World Cup Draft <magic@kelham.co>"`.
3. Run the app, request a magic link to your own address, confirm it arrives from
   `kelham.co` and signs you in.

## Risks / caveats

- **MailerSend trial accounts can only send to the account owner's email** until the
  account is approved for sending (the approval questionnaire). `kelham.co` is verified, but
  links to *other* users bounce until approval completes. The API key alone is not enough.
- **Trial plan = one custom domain.** A separate sending subdomain needs the paid Starter
  plan; hence sending from `kelham.co` directly. (See "Domain decision".)
- **Shared SPF on `kelham.co`:** if `kelham.co` already sends via another provider, ensure
  there is a single merged SPF record (multiple SPF TXT records are invalid). DKIM/return-
  path are per-selector and don't collide.
- **202-with-empty-body success:** do not attempt to `JSON.parse` the success response body.
- **Convex isolation:** build/codegen/`yarn dev` deferred to post-merge (per CLAUDE.md);
  the whole TDD loop runs on vitest only.

## Out of scope

- Removing the `AUTH_RESEND_KEY` env var from the deployment (manual).
- Uninstalling any package (`@auth/core` stays — it's the auth engine).
- Branding/HTML email template polish beyond a functional magic-link email.
