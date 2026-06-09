# MailerSend Magic-Link Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Resend email transport for magic-link sign-in with MailerSend, with no change to the auth flow itself.

**Architecture:** Auth.js ships no MailerSend provider, so we add a custom `type: "email"` provider whose `sendVerificationRequest` POSTs to MailerSend's REST API via `fetch`. All testable logic (from-address parsing, payload building, the HTTP call + error handling) lives in a pure `convex/lib/mailerSend.ts` module following the repo's existing external-boundary pattern (`convex/espn.ts`). The provider wiring in `convex/auth.ts` and the `signIn(...)` call in `components/SignIn.tsx` are thin edits.

**Tech Stack:** Convex + `@convex-dev/auth` (Auth.js core), Zod for data-shape schemas, Vitest + `convex-test` for tests, `fetch` (Convex default runtime — no Node action).

**Spec:** `docs/superpowers/specs/2026-06-09-mailersend-auth-email-design.md`

---

## File Structure

- **Create** `convex/lib/mailerSend.ts` — Zod schemas (`FromAddressSchema`, `MailerSendPayloadSchema`, `MailerSendErrorSchema`) + three functions: `parseFrom`, `buildMagicLinkEmail`, `sendMailerSendEmail`. Single responsibility: turn (to, url, from, apiKey) into a sent MailerSend email; the only place that knows MailerSend's API contract.
- **Create** `convex/tests/mailerSend.test.ts` — unit tests for the above (node environment; stubs global `fetch`).
- **Modify** `convex/auth.ts` — swap the Resend provider for the MailerSend provider (config; keep `Password()`).
- **Modify** `components/SignIn.tsx:55` — `signIn("resend", …)` → `signIn("mailersend", …)`.
- **Modify** `components/SignIn.test.tsx:25,32` — magic-link assertion `"resend"` → `"mailersend"`.

## Conventions (read before starting)

- Run all commands from the worktree root `.worktrees/mailersend-auth`.
- Test runner: `yarn test --run <path>` (vitest). The TDD loop is vitest-only — **do not** run `convex dev`, `convex codegen`, or `yarn build` (per CLAUDE.md Convex isolation; codegen/build deferred to post-merge).
- Convex tests default to the **node** environment (global `fetch` and `Response` exist via Node). Only `components/*.test.tsx` opt into jsdom via a `// @vitest-environment jsdom` header.
- Commit messages: no `Co-Authored-By` / AI-attribution trailer.

---

### Task 1: `parseFrom` — parse an Auth.js from-string

**Files:**
- Create: `convex/lib/mailerSend.ts`
- Test: `convex/tests/mailerSend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/tests/mailerSend.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFrom } from "../lib/mailerSend";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseFrom", () => {
  it('parses "Display Name <addr@domain>" into name + email', () => {
    expect(parseFrom("World Cup Draft <magic@send.kelham.co>")).toEqual({
      name: "World Cup Draft",
      email: "magic@send.kelham.co",
    });
  });

  it("parses a bare address into just an email", () => {
    expect(parseFrom("magic@send.kelham.co")).toEqual({
      email: "magic@send.kelham.co",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --run convex/tests/mailerSend.test.ts`
Expected: FAIL — `parseFrom` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `convex/lib/mailerSend.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --run convex/tests/mailerSend.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/mailerSend.ts convex/tests/mailerSend.test.ts
git commit -m "feat(email): parseFrom for MailerSend from-address (TDD)"
```

---

### Task 2: `buildMagicLinkEmail` — build the MailerSend payload

**Files:**
- Modify: `convex/lib/mailerSend.ts`
- Test: `convex/tests/mailerSend.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `convex/tests/mailerSend.test.ts`:

```typescript
import { buildMagicLinkEmail } from "../lib/mailerSend";

describe("buildMagicLinkEmail", () => {
  const url = "https://worldcupdraft.example/api/auth/verify?token=abc123";

  it("builds a payload with parsed from, to, subject, and the url in html and text", () => {
    const payload = buildMagicLinkEmail({
      to: "player@example.com",
      url,
      from: "World Cup Draft <magic@send.kelham.co>",
    });

    expect(payload.from).toEqual({
      name: "World Cup Draft",
      email: "magic@send.kelham.co",
    });
    expect(payload.to).toEqual([{ email: "player@example.com" }]);
    expect(payload.subject).toBe("Sign in to World Cup Draft");
    expect(payload.html).toContain(url);
    expect(payload.text).toContain(url);
  });
});
```

> Add `buildMagicLinkEmail` to the existing `import { parseFrom } from "../lib/mailerSend";` line, or add a new import — either is fine.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --run convex/tests/mailerSend.test.ts`
Expected: FAIL — `buildMagicLinkEmail` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `convex/lib/mailerSend.ts` (after `parseFrom`):

```typescript
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
export function buildMagicLinkEmail(args: {
  to: string;
  url: string;
  from: string;
}): MailerSendPayload {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --run convex/tests/mailerSend.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/mailerSend.ts convex/tests/mailerSend.test.ts
git commit -m "feat(email): buildMagicLinkEmail payload (TDD)"
```

---

### Task 3: `sendMailerSendEmail` — success path (202 → messageId)

**Files:**
- Modify: `convex/lib/mailerSend.ts`
- Test: `convex/tests/mailerSend.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `convex/tests/mailerSend.test.ts`:

```typescript
import { sendMailerSendEmail } from "../lib/mailerSend";

const samplePayload = {
  from: { name: "World Cup Draft", email: "magic@send.kelham.co" },
  to: [{ email: "player@example.com" }],
  subject: "Sign in to World Cup Draft",
  html: "<p>link</p>",
  text: "link",
};

describe("sendMailerSendEmail", () => {
  it("POSTs to MailerSend with bearer auth and resolves with the message id on 202", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 202,
          headers: { "x-message-id": "msg-123" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMailerSendEmail({
      apiKey: "key-abc",
      payload: samplePayload,
    });

    expect(result).toEqual({ messageId: "msg-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mailersend.com/v1/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer key-abc",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(samplePayload),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --run convex/tests/mailerSend.test.ts`
Expected: FAIL — `sendMailerSendEmail` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `convex/lib/mailerSend.ts`:

```typescript
const MAILERSEND_ENDPOINT = "https://api.mailersend.com/v1/email";

/** Send a pre-built payload via the MailerSend REST API. Throws on non-2xx. */
export async function sendMailerSendEmail(args: {
  apiKey: string;
  payload: MailerSendPayload;
}): Promise<{ messageId?: string }> {
  const { apiKey, payload } = args;
  const res = await fetch(MAILERSEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`MailerSend send failed (${res.status})`);
  }
  return { messageId: res.headers.get("x-message-id") ?? undefined };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --run convex/tests/mailerSend.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/mailerSend.ts convex/tests/mailerSend.test.ts
git commit -m "feat(email): sendMailerSendEmail success path (TDD)"
```

---

### Task 4: `sendMailerSendEmail` — error body (422 → throw with MailerSend's message)

**Files:**
- Modify: `convex/lib/mailerSend.ts`
- Test: `convex/tests/mailerSend.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("sendMailerSendEmail", …)` block in `convex/tests/mailerSend.test.ts`:

```typescript
  it("throws including MailerSend's message when the API returns a 422 error body", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: "The given data was invalid.",
            errors: { "to.0.email": ["The email must be a valid email address."] },
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendMailerSendEmail({ apiKey: "key-abc", payload: samplePayload }),
    ).rejects.toThrow(/The given data was invalid\./);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --run convex/tests/mailerSend.test.ts`
Expected: FAIL — current error is `MailerSend send failed (422)`, which does not match `/The given data was invalid\./`.

- [ ] **Step 3: Write minimal implementation**

In `convex/lib/mailerSend.ts`, add the error schema (after `MailerSendPayloadSchema`):

```typescript
export const MailerSendErrorSchema = z.object({
  message: z.string(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});
export type MailerSendError = z.infer<typeof MailerSendErrorSchema>;
```

Then replace the `if (!res.ok)` block in `sendMailerSendEmail`:

```typescript
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = MailerSendErrorSchema.parse(await res.json());
      detail = body.message;
    } catch {
      // non-JSON or unexpected error body — keep the HTTP status detail
    }
    throw new Error(`MailerSend send failed (${res.status}): ${detail}`);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --run convex/tests/mailerSend.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/mailerSend.ts convex/tests/mailerSend.test.ts
git commit -m "feat(email): surface MailerSend error message on non-2xx (TDD)"
```

---

### Task 5: `sendMailerSendEmail` — malformed error body (non-JSON → fallback)

**Files:**
- Test: `convex/tests/mailerSend.test.ts` (implementation already handles this — this task pins the behavior)

- [ ] **Step 1: Write the failing test**

Append inside the `describe("sendMailerSendEmail", …)` block:

```typescript
  it("falls back to the HTTP status when the error body is not valid JSON", async () => {
    const fetchMock = vi.fn(
      async () => new Response("<html>500</html>", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendMailerSendEmail({ apiKey: "key-abc", payload: samplePayload }),
    ).rejects.toThrow(/500/);
  });
```

- [ ] **Step 2: Run test to verify it fails OR passes for the right reason**

Run: `yarn test --run convex/tests/mailerSend.test.ts`
Expected: PASS — the Task 4 implementation already catches the JSON-parse failure and falls back to `HTTP 500`. (This is an intentional regression-pinning test for the catch branch; if it ever fails, the fallback is broken.) If it unexpectedly FAILS, fix `sendMailerSendEmail`, not the test.

- [ ] **Step 3: Commit**

```bash
git add convex/tests/mailerSend.test.ts
git commit -m "test(email): pin fallback for malformed MailerSend error body"
```

---

### Task 6: Wire the MailerSend provider into `convex/auth.ts`

**Files:**
- Modify: `convex/auth.ts`

> This is provider **configuration** (TDD-exempt, like the existing `Resend(...)` / `Password()` wiring). It is verified by the Task 1–5 unit tests plus the manual end-to-end send. There is no unit test for this file.

- [ ] **Step 1: Replace the file contents**

Replace `convex/auth.ts` entirely with:

```typescript
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
```

- [ ] **Step 2: Run the full suite to confirm nothing regressed**

Run: `yarn test --run`
Expected: PASS — all tests green (the existing `SignIn` magic-link test still expects `"resend"` at this point; it stays green because `SignIn.tsx` is unchanged until Task 7).

- [ ] **Step 3: Commit**

```bash
git add convex/auth.ts
git commit -m "feat(auth): send magic-link emails via MailerSend provider"
```

---

### Task 7: Point the sign-in form at the `mailersend` provider

**Files:**
- Modify: `components/SignIn.test.tsx:25,32`
- Modify: `components/SignIn.tsx:55`

- [ ] **Step 1: Write the failing test (edit the existing assertion)**

In `components/SignIn.test.tsx`, update the magic-link test. Change the `it(...)` title and the provider assertion:

```typescript
  it("calls signIn('mailersend', …) with the email and shows the sent state", async () => {
```

and

```typescript
    expect(provider).toBe("mailersend");
```

Leave the `"password"` tests untouched.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --run components/SignIn.test.tsx`
Expected: FAIL — `expect(provider).toBe("mailersend")` receives `"resend"` (the component still calls `signIn("resend", …)`).

- [ ] **Step 3: Write minimal implementation**

In `components/SignIn.tsx` line ~55, change the magic-link call:

```typescript
      await signIn("mailersend", formData);
```

(Leave the `signIn("password", formData)` call on line ~73 unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --run components/SignIn.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/SignIn.tsx components/SignIn.test.tsx
git commit -m "feat(auth): sign-in form requests the mailersend provider (TDD)"
```

---

### Task 8: Full-suite verification

**Files:** none

- [ ] **Step 1: Run the entire suite**

Run: `yarn test --run`
Expected: PASS — all test files green, output pristine (no errors/warnings), and the new `convex/tests/mailerSend.test.ts` (6 tests) included.

- [ ] **Step 2: Confirm no stray `resend` references remain in app code**

Run: `grep -rin "resend" convex/ components/ --include="*.ts" --include="*.tsx"`
Expected: no matches in `convex/auth.ts`, `components/SignIn.tsx`, or `components/SignIn.test.tsx`. (Comments referencing the old `AUTH_RESEND_KEY` env var should be gone; `onboarding@resend.dev` remains only as the unverified-testing fallback in `auth.ts` — acceptable.)

- [ ] **Step 3: Confirm `main` did not advance**

Run: `git -C /Users/samkelham/Sites/WorldCupDraft/app log --oneline -1`
Expected: unchanged from session start (all commits are on `mailersend-auth`).

---

## Post-implementation (manual, outside this plan)

These are the user's steps, tracked in the spec — not implemented here:

1. MailerSend: verify `send.kelham.co` (Cloudflare DNS), complete the account-approval questionnaire, generate an API token.
2. Set deployment env vars: `npx convex env set MAILERSEND_API_KEY <token>` and `npx convex env set MAILERSEND_FROM "World Cup Draft <magic@send.kelham.co>"`.
3. End-to-end: run the app, request a magic link to your own address, confirm delivery from `send.kelham.co` and successful sign-in.
4. Optional cleanup: remove the now-unused `AUTH_RESEND_KEY` from the deployment.
5. Merge `mailersend-auth` → `main`; codegen / `yarn build` happen post-merge per CLAUDE.md.

## Self-review notes

- **Spec coverage:** `convex/lib/mailerSend.ts` (parse/build/send) ✓; Zod boundary validation of error body ✓ (Task 4); `auth.ts` provider swap keeping `Password()` ✓ (Task 6); `SignIn.tsx` id rename ✓ (Task 7); env vars documented ✓; security (api key from env, token URL only in body, fail-closed throw) ✓ — covered by `sendMailerSendEmail` throwing on failure and reading the key from env in `auth.ts`.
- **Type consistency:** `parseFrom`→`FromAddress`; `buildMagicLinkEmail`→`MailerSendPayload`; `sendMailerSendEmail({ apiKey, payload })`→`{ messageId? }`; `MailerSendErrorSchema` used only inside `sendMailerSendEmail`. Names consistent across tasks.
- **No placeholders:** every code step shows complete code; every run step shows the exact command + expected result.
