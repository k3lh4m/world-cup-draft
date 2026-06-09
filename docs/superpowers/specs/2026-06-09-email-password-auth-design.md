# Email + password authentication (testing-friendly) — design

**Date:** 2026-06-09
**Status:** Approved (brainstorming) — ready for implementation plan

## Goal

Add email + password sign-in / sign-up alongside the existing magic-link flow, so
multiple test accounts can be created without sending emails. Magic-link delivery via
Resend's `onboarding@resend.dev` only reaches the Resend account owner's own address, so
it cannot be used to exercise multi-user flows (creating a league as one user, joining as
another). Email + password with **no verification and no 2FA** removes that blocker.

## Context (verified against the codebase)

- Auth is **Convex Auth** (`@convex-dev/auth`) with the **Resend** magic-link provider in
  `convex/auth.ts`. `AUTH_RESEND_KEY` is set on the dev deployment.
- The installed `@convex-dev/auth` ships a **`Password`** provider
  (`@convex-dev/auth/providers/Password`): flows `signUp` / `signIn` (also `reset`,
  `reset-verification`, `email-verification`), with **email verification off by default**
  and a default password rule (non-empty, **≥ 8 chars**). It stores credentials in
  `authAccounts` (already registered via `...authTables`) — **no schema change**.
- The UI is a shared `SignIn` card rendered by `AuthGate`, which also runs `RequireName`
  after sign-in to capture a global display name. `SignIn` already has Testing-Library
  coverage (`components/SignIn.test.tsx`) mocking `useAuthActions().signIn`.

## Decisions

- **Always available** (not dev-gated). Password UI shows in all environments.
  - *Accepted MVP risk:* without email verification, anyone can register any email
    address. Acceptable for a trusted friend-group MVP; revisit before any public launch.
- **Magic link stays the default view**; a text link reveals the password panel.
- **Name reuses `RequireName`** (the post-sign-in gate) — the password form does not
  collect a name, keeping one name-capture path and needing no `profile()` override.

## Backend — `convex/auth.ts`

Register the `Password` provider with default config:

```ts
import Password from "@convex-dev/auth/providers/Password";
// providers: [ Resend({ from: "World Cup Draft <onboarding@resend.dev>" }), Password ]
```

No `profile()` override (default returns `{ email }`; name handled by `RequireName`). No
schema change. This is provider configuration — treated as config for TDD purposes, but
see Testing for the end-to-end acceptance requirement.

## Frontend — extend `components/SignIn.tsx`

New state: `mode: "magic" | "password"`, `passwordFlow: "signIn" | "signUp"`.

- **Magic-link view (default):** unchanged (email → "check your inbox"). Add a text link
  beneath it: **"Sign in with a password instead"** → sets `mode = "password"`.
- **Password view:**
  - `email` + `password` inputs (`password` `type=password`, `minLength` hint "at least 8
    characters").
  - Primary button labelled by `passwordFlow`: **"Sign in"** or **"Create account"**.
  - Sub-toggle link: *"Don't have an account? Create one"* ⇄ *"Already have an account?
    Sign in"* (flips `passwordFlow`).
  - **"← Back to magic link"** link → `mode = "magic"`.
  - Submit → `signIn("password", formDataWith({ email, password, flow: passwordFlow,
    redirectTo: next }))`. `sending` disables the button.
  - Errors → `toast.error` with a friendly message (map Convex Auth's generic
    `InvalidAccountId` / `InvalidSecret` to "Incorrect email or password"; fall back to a
    generic message otherwise).

`next` is forwarded as `redirectTo` exactly as the magic-link path does, so the invite
join flow is unchanged.

## Data flow after sign-in (unchanged)

Password sign-in/up authenticates immediately (no "check your inbox" step) → `AuthGate`
renders `RequireName` → name prompt if unset → dashboard. Invite flow: open the app as
user A (create league), open an incognito window, **Create account** as user B, follow the
invite link → join. Same `RequireName` + `next` behaviour for both providers.

## Error handling

- Wrong password / unknown account → toast "Incorrect email or password."
- Sign-up with an email that already has a password account → toast "An account with this
  email already exists — try signing in."
- Password too short → toast "Password must be at least 8 characters." (mirror the default
  rule; also enforce `minLength={8}` on the input.)
- Unknown errors → toast the error message or a generic fallback.

## Testing

### Component (TDD, extends `components/SignIn.test.tsx`)

Reuses the existing `useAuthActions().signIn` + `sonner` mocks.

- "Sign in with a password instead" reveals the email + password fields.
- Submitting the password form (sign-in mode) calls `signIn("password", …)` with a
  FormData whose `flow` is `"signIn"` and correct `email` / `password`.
- Toggling to "Create account" and submitting sends `flow: "signUp"`.
- `next` is forwarded as `redirectTo` on the password submit.
- "Back to magic link" returns to the email-only magic-link form.

### Backend / end-to-end (acceptance)

The provider line is configuration (no convex-test unit test — the repo doesn't unit-test
auth flows). **Done is not done until the app is run and a password account is registered
end-to-end** (sign up → name capture → dashboard; sign in again as the same user). This
explicit run guards against the "providers looked configured but sign-in never worked"
failure mode.

## Scope — explicitly OUT (YAGNI)

- No password reset (needs email), no email verification, no 2FA, no strength meter.
- No dev-gating (password is always available, per decision).
- No `profile()` customisation, no schema change.
- No change to magic link, `RequireName`, `AuthGate`, or the join flow beyond the `SignIn`
  additions above.

## Process

- Built in a **git worktree off `main`** (per `CLAUDE.md`), component logic **test-first**.
- After implementation, run the app and verify a real password sign-up/sign-in before
  claiming completion.
