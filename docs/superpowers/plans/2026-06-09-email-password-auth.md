# Email + Password Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email + password sign-in / sign-up (no email verification, no 2FA) alongside the existing magic-link flow, so multiple test accounts can be created without sending emails.

**Architecture:** Register Convex Auth's built-in `Password` provider in `convex/auth.ts` (default config — verification off). Extend the existing `components/SignIn.tsx` card with a reveal link to a password panel that calls `signIn("password", { email, password, flow })`. Name capture, redirect (`next`), and league-join flows are unchanged — the post-sign-in `RequireName` gate handles the display name for password users too.

**Tech Stack:** Next.js 16 (App Router), React 19, Convex + `@convex-dev/auth`, shadcn/Base UI components, vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-09-email-password-auth-design.md`

---

### Task 1: Register the Password provider (backend)

**Files:**
- Modify: `convex/auth.ts`

Provider registration is configuration, not testable logic (the repo does not unit-test auth flows), so this task has no convex-test. It is validated by typecheck + the end-to-end run in Task 3.

- [ ] **Step 1: Add the Password provider**

Edit `convex/auth.ts` to import and register `Password` alongside `Resend`:

```ts
import { convexAuth } from "@convex-dev/auth/server";
import Resend from "@auth/core/providers/resend";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Resend({
      // onboarding@resend.dev sends without domain verification for testing.
      // Reads the API key from the AUTH_RESEND_KEY env var on the deployment.
      from: "World Cup Draft <onboarding@resend.dev>",
    }),
    // Email + password for creating test accounts without sending email.
    // Email verification is off by default; default rule requires >= 8 chars.
    Password(),
  ],
});
```

> Note: `Password` is a **named** export and a factory function (call it), not a default export.

- [ ] **Step 2: Regenerate Convex types and typecheck**

Run:
```bash
npx convex codegen
npx tsc --noEmit
```
Expected: codegen completes ("Running TypeScript..."); `tsc` prints nothing (clean). The `password` provider becomes available to `signIn` at runtime.

- [ ] **Step 3: Commit**

```bash
git add convex/auth.ts convex/_generated
git commit -m "feat(auth): register Password provider (email+password, no verification)"
```

---

### Task 2: Password panel in SignIn (frontend, TDD)

**Files:**
- Modify: `components/SignIn.tsx`
- Modify (tests): `components/SignIn.test.tsx`

The magic-link card gains a second button ("Use a password instead"), so the existing tests that call `screen.getByRole("button")` (no name) will start throwing "multiple elements". Step 1 makes those queries specific (still describing current behaviour → stays green), then Steps 2-5 add the password behaviour test-first.

- [ ] **Step 1: Make existing magic-link button queries specific**

In `components/SignIn.test.tsx`, replace every bare `screen.getByRole("button")` with the named submit button, and assert the reveal link will exist. Update the four existing tests' button lookups:

```ts
// in "renders the email form":
expect(
  screen.getByRole("button", { name: "Email me a sign-in link" }),
).toBeInTheDocument();

// in the two submit tests ("calls signIn('resend'…)" and "forwards `next`…"):
await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

// in "'use a different email' returns to the form": the sent-state reset button
// already uses { name: /different email/i } — leave it unchanged.
```

Run:
```bash
npx vitest run components/SignIn.test.tsx
```
Expected: PASS (4/4) — behaviour unchanged, queries just disambiguated.

- [ ] **Step 2: Write failing tests for the password panel**

Append to `components/SignIn.test.tsx`:

```ts
describe("SignIn — password", () => {
  it("reveals the password form", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.click(screen.getByRole("button", { name: "Use a password instead" }));
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("submits the sign-in flow with email and password", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.click(screen.getByRole("button", { name: "Use a password instead" }));
    await user.type(screen.getByLabelText(/email/i), "b@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "supersecret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const [provider, formData] = signInMock.mock.calls[0];
    expect(provider).toBe("password");
    expect((formData as FormData).get("email")).toBe("b@example.com");
    expect((formData as FormData).get("password")).toBe("supersecret");
    expect((formData as FormData).get("flow")).toBe("signIn");
  });

  it("submits the sign-up flow after toggling to create account", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.click(screen.getByRole("button", { name: "Use a password instead" }));
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText(/email/i), "c@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "supersecret");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    const formData = signInMock.mock.calls[0][1] as FormData;
    expect(formData.get("flow")).toBe("signUp");
  });

  it("forwards `next` as redirectTo on the password submit", async () => {
    const user = userEvent.setup();
    render(<SignIn next="/join/abc" />);
    await user.click(screen.getByRole("button", { name: "Use a password instead" }));
    await user.type(screen.getByLabelText(/email/i), "b@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "supersecret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const formData = signInMock.mock.calls[0][1] as FormData;
    expect(formData.get("redirectTo")).toBe("/join/abc");
  });

  it("returns to the magic-link form via 'Back to magic link'", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.click(screen.getByRole("button", { name: "Use a password instead" }));
    await user.click(screen.getByRole("button", { name: "Back to magic link" }));
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run:
```bash
npx vitest run components/SignIn.test.tsx
```
Expected: the 5 new tests FAIL (no "Use a password instead" button yet); the 4 original tests still PASS.

- [ ] **Step 4: Implement the password panel**

Replace the entire contents of `components/SignIn.tsx` with:

```tsx
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "magic" | "password";
type PasswordFlow = "signIn" | "signUp";

/** Map Convex Auth's generic password errors to friendly copy. */
function passwordErrorMessage(err: unknown, flow: PasswordFlow): string {
  const msg = err instanceof Error ? err.message : "";
  if (/InvalidSecret|InvalidAccountId/i.test(msg)) {
    return "Incorrect email or password.";
  }
  if (/already|exists/i.test(msg)) {
    return "An account with this email already exists — try signing in.";
  }
  if (flow === "signUp" && /8|short|length|password/i.test(msg)) {
    return "Password must be at least 8 characters.";
  }
  return msg || "Something went wrong. Please try again.";
}

/**
 * Passwordless magic-link sign-in (default) plus an email + password panel for
 * creating test accounts without sending email. The same flows sign in returning
 * users and create new ones; `next` is forwarded as the post-sign-in redirect.
 */
export function SignIn({ next }: { next?: string }) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>("magic");
  const [passwordFlow, setPasswordFlow] = useState<PasswordFlow>("signIn");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onMagicSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");
    if (next) formData.set("redirectTo", next);
    setSending(true);
    try {
      await signIn("resend", formData);
      setSentTo(email);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not send the sign-in link",
      );
    } finally {
      setSending(false);
    }
  }

  async function onPasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("flow", passwordFlow);
    if (next) formData.set("redirectTo", next);
    setSending(true);
    try {
      await signIn("password", formData);
      // Authenticated immediately — AuthGate/RequireName take over.
    } catch (err) {
      toast.error(passwordErrorMessage(err, passwordFlow));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-3xl" aria-hidden>
          ⚽
        </span>
        <h1 className="font-heading text-xl font-semibold">World Cup Draft</h1>
        <p className="text-muted-foreground text-sm">
          Draft your squad and compete with friends.
        </p>
      </div>

      {sentTo ? (
        <Card>
          <CardHeader>
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>
              We sent a sign-in link to{" "}
              <span className="text-foreground font-medium">{sentTo}</span>.
              Click it to finish signing in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="ghost"
              className="px-0"
              onClick={() => setSentTo(null)}
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      ) : mode === "magic" ? (
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a magic link — no password
              needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form className="flex flex-col gap-4" onSubmit={onMagicSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <Button type="submit" disabled={sending}>
                {sending ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
            <Button
              type="button"
              variant="link"
              className="self-center px-0"
              onClick={() => setMode("password")}
            >
              Use a password instead
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {passwordFlow === "signIn" ? "Sign in" : "Create account"}
            </CardTitle>
            <CardDescription>
              {passwordFlow === "signIn"
                ? "Use your email and password."
                : "Pick an email and password to create a test account."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form className="flex flex-col gap-4" onSubmit={onPasswordSubmit}>
              <div className="space-y-2">
                <Label htmlFor="pw-email">Email</Label>
                <Input
                  id="pw-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw-password">Password</Label>
                <Input
                  id="pw-password"
                  name="password"
                  type="password"
                  autoComplete={
                    passwordFlow === "signIn" ? "current-password" : "new-password"
                  }
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
                <p className="text-muted-foreground text-xs">
                  At least 8 characters.
                </p>
              </div>
              <Button type="submit" disabled={sending}>
                {sending
                  ? "Please wait…"
                  : passwordFlow === "signIn"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>
            <div className="flex flex-col items-center gap-1">
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() =>
                  setPasswordFlow(passwordFlow === "signIn" ? "signUp" : "signIn")
                }
              >
                {passwordFlow === "signIn" ? "Create an account" : "Sign in instead"}
              </Button>
              <Button
                type="button"
                variant="link"
                className="text-muted-foreground px-0"
                onClick={() => setMode("magic")}
              >
                Back to magic link
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx vitest run components/SignIn.test.tsx
```
Expected: PASS (9/9 — 4 magic + 5 password).

- [ ] **Step 6: Full verify (suite + types + lint + build)**

Run:
```bash
npx vitest run
npx tsc --noEmit
npx eslint components/SignIn.tsx components/SignIn.test.tsx convex/auth.ts
yarn build
```
Expected: all tests pass; `tsc` clean; eslint exit 0; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/SignIn.tsx components/SignIn.test.tsx
git commit -m "feat(auth): email+password panel on the sign-in card (TDD)"
```

---

### Task 3: End-to-end verification (acceptance — not optional)

No code. Confirms the provider actually works at runtime (guards against the "providers configured but sign-in never works" failure mode). Requires `convex dev` running and the env var `AUTH_RESEND_KEY` already set.

- [ ] **Step 1: Start the backend and app**

In two terminals (from the worktree):
```bash
npx convex dev      # pushes functions incl. the Password provider
yarn dev            # Next dev server (use -p 3001 if 3000 is taken)
```

- [ ] **Step 2: Register a test account**

In the browser: open the app → "Use a password instead" → "Create an account" → enter `tester@example.com` + an 8+ char password → submit. Expected: signed in immediately, then the "What should we call you?" name step appears → set a name → dashboard.

- [ ] **Step 3: Verify sign-in + multi-user join**

- Sign out (or open an incognito window). Sign back in with the same email + password → reaches the dashboard (no name prompt — name persisted).
- As the first user, create a league and copy its invite link. In an incognito window, create a second password account, open the invite link → join the league. Expected: the league shows both members.

- [ ] **Step 4: Note the result**

Record the outcome (works / any errors) before declaring the feature complete. If sign-up throws, capture the exact error string — Convex Auth password error messages may need adding to `passwordErrorMessage`.

---

## Notes for the implementer

- **Accessible-name disambiguation:** Testing Library treats a string `name` as an exact full-name match, so `{ name: "Sign in" }` matches only the primary button, not the "Sign in instead" toggle or the "Use a password instead" reveal. Keep these labels exactly as written.
- **Do not add a name field to the password form** — the existing `RequireName` gate captures it after sign-in (spec decision).
- **No schema change, no `RequireName`/`AuthGate`/join-page edits.**
