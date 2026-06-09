# Magic-link authentication screen — design

**Date:** 2026-06-09
**Status:** Approved (brainstorming) — ready for implementation plan

## Goal

Replace the bare, unstyled sign-in component with a polished, on-brand
authentication experience built from the project's shadcn/ui components and design
tokens. Collect a global display name as part of "creating an account."

## Context (verified against the codebase)

- **Auth is passwordless magic-link** — Convex Auth (`@convex-dev/auth`) + the Resend
  email provider (`convex/auth.ts`). User enters an email, receives a sign-in link,
  clicks it, and is authenticated. The same flow signs in returning users **and**
  creates new ones, so there is no separate "login" vs "create account" page.
- **Auth gating is client-side** via `<Unauthenticated>` / `<Authenticated>` on each
  page. `middleware.ts` only wraps with `convexAuthNextjsMiddleware()` — no route
  protection. **Unchanged by this work.**
- **The `users` table** comes from `...authTables` and already has an optional `name`
  field — **no schema change needed**.
- **The current `components/SignIn.tsx`** is raw `<input>`/`<button>` HTML. It is reused
  on the homepage (`app/page.tsx`) and the invite page (`app/join/[token]/page.tsx`),
  and already supports a `next` prop that sets `redirectTo` for post-sign-in redirect.
- **Tests** live in `convex/tests/` (Convex `convex-test` + vitest, backend only).
  There is **no React component test harness** in the repo.

### Key constraint discovered (drives the name-capture design)

Convex Auth's email/magic-link flow does **not** carry arbitrary fields through the
email round-trip. At verification (`@convex-dev/auth/.../verifyCodeAndSignIn.js`), the
profile passed to user creation is hardcoded to `{ email, phone }`. A `name` typed when
requesting the link is **dropped**. Therefore the name must be captured **after**
sign-in, not on the magic-link request screen.

## Decisions

- **Auth screen is email-only.** One polished magic-link card.
- **Name is captured after the first sign-in** (chosen over a localStorage stash). If the
  signed-in user has no `name`, show a one-field "What should we call you?" step before
  the protected content.
- **Best-UX placement: inline, full-screen on the signed-out homepage** (the app has no
  marketing landing — when signed out, the homepage's only job is to sign you in). No
  dedicated `/login` route; the invite flow already redirects back via the magic link's
  `redirectTo`.
- **One shared `<AuthGate>` wrapper** composes the pattern so the homepage and join page
  don't duplicate it.
- **Per-league display-name fields prefill from the global name** (in `Dashboard` and
  `JoinForm`) — included, not optional.
- **A React/Next component test harness is set up** (jsdom + Testing Library) so the new
  UI components are covered by automated tests, not just the backend.

## Components

### 1. `components/SignIn.tsx` (rewrite — shared, email-only)

Centered shadcn `Card`. Two states:

- **Idle:** branded header (⚽ *World Cup Draft* + one-line tagline), `Label` + `Input`
  (`type=email`, required), full-width primary `Button` ("Email me a sign-in link") with a
  loading state. Errors surfaced via `toast`.
- **Sent:** "Check your inbox" panel showing the address the link went to, plus a "use a
  different email" action that resets to idle.

Keeps the `next?: string` prop and the existing `signIn("resend", fd)` call with
`fd.set("redirectTo", next)`.

### 2. `components/RequireName.tsx`

Renders inside `<Authenticated>`. Calls `getMe`:

- loading → render nothing (avoid flash),
- `name` empty/absent → show a one-field card ("What should we call you?", single `Input`
  + `Button` → `setMyName`), with loading + `toast` on error,
- otherwise → render `children`.

### 3. `components/AuthGate.tsx` (DRY wrapper)

```tsx
<AuthGate next={...}>{protectedContent}</AuthGate>
// Unauthenticated → <SignIn next={next} />
// Authenticated   → <RequireName>{children}</RequireName>
```

- `app/page.tsx` wraps `<Dashboard/>`.
- `app/join/[token]/page.tsx` wraps `<JoinForm/>` (passes `next={/join/${token}}`).

The per-league display-name `Input` in `Dashboard` and `JoinForm` prefills its initial
value from the global `name` (falling back to empty if the user has no name yet).

### 4. Backend — new `convex/users.ts` (TDD)

- `getMe` (query) → `{ _id, email, name } | null` for the signed-in user. Returns `null`
  when unauthenticated (uses `getAuthUserId`, not `requireUserId`, so it doesn't throw for
  signed-out callers).
- `setMyName` (mutation) → args `{ name: v.string() }`. Auth-required via the existing
  `requireUserId` (`convex/lib/membership.ts`). Trims; rejects empty/whitespace-only;
  caps length (50 chars); `ctx.db.patch(userId, { name })`.

## Styling / tokens

Pure shadcn token usage — `background`, `foreground`, `muted-foreground`, `card`,
`border`, `primary` — so light/dark both work through the existing `ThemeProvider`. No new
colors, no hardcoded hex. Layout: centered `min-h-screen`, `max-w-sm` card, `ThemeToggle`
kept in the corner. Verify the rendered result against the **installed** `components/ui/*`
source (Base UI / base-nova), not upstream Radix docs.

## Testing

### Test-harness setup (new)

The repo currently runs vitest in the `node` environment (Convex tests opt into
edge-runtime via a per-file docblock). Add a **jsdom** environment for React component
tests, scoped so it doesn't disturb the existing node/edge tests:

- Dev deps: `jsdom`, `@testing-library/react`, `@testing-library/user-event`,
  `@testing-library/jest-dom`, `@vitejs/plugin-react`.
- `vitest.config.ts`: add `@vitejs/plugin-react`, extend `include` to cover
  `components/**/*.test.tsx`, register a `setupFiles` entry that imports
  `@testing-library/jest-dom`. Component test files select jsdom with a per-file
  `// @vitest-environment jsdom` docblock — consistent with the existing edge-runtime
  docblock convention (keeps the default environment `node`).
- Smoke test to prove the harness works before building features.

### Backend (TDD, red→green) — `convex/tests/users.test.ts`

- `setMyName` requires authentication (throws for signed-out caller).
- `setMyName` trims and stores the name; `getMe` reflects it.
- `setMyName` rejects an empty / whitespace-only name.
- `getMe` returns `null` when signed out.

### Frontend (TDD, red→green) — `components/*.test.tsx`

Mock `convex/react` (`useQuery`/`useMutation`) and `@convex-dev/auth/react`
(`useAuthActions`) so components render without a live backend.

- `RequireName`: renders the name form when `getMe` returns a user with no `name`;
  renders `children` when `name` is present; renders nothing while `getMe` is loading
  (`undefined`); submitting calls `setMyName` with the trimmed value.
- `SignIn`: renders the email form; submitting calls `signIn("resend", …)` and switches
  to the "check your inbox" state; "use a different email" resets to the form.
- `AuthGate`: renders `SignIn` for the unauthenticated branch and `RequireName`-wrapped
  children for the authenticated branch (driven by mocked `Authenticated`/`Unauthenticated`).

## Scope — explicitly OUT (YAGNI)

- No passwords, no OAuth, no `/login` route, no separate signup page.
- No schema change (the `users.name` field already exists).
- No middleware route-protection changes.
- No email validation beyond `type=email` + required; no rate-limit UI (backend handles).
- No end-to-end / browser test runner (Playwright etc.) — component tests via Testing
  Library + jsdom only.

## Process

- Implementation runs in a **git worktree off `main`** (per `CLAUDE.md`), set up at the
  start of the build — not during brainstorming.
- Backend written **test-first** (red → verify red → green → refactor).
