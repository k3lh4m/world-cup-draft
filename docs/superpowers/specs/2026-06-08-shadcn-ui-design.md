# Spec: Add shadcn/ui (token-themed) to WorldCupDraft

**Date:** 2026-06-08
**Status:** Approved (design) — pending implementation plan
**Scope:** Setup + smoke test only

## 1. Goal

Install and configure [shadcn/ui](https://ui.shadcn.com) as the app's component
system, themed with a token-based World Cup palette and light/dark support, then
rebuild the default home page into a demo that exercises the components as a smoke
test. No real application features are built in this work — the deliverable is a
themed, working component system plus proof that it renders and builds correctly.

## 2. Context

- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4 (CSS-first, via
  `@tailwindcss/postcss`), Convex backend, Yarn 1.22.
- **Current frontend:** barely scaffolded — default `app/layout.tsx`, `app/page.tsx`,
  and a minimal `app/globals.css` that already uses `@import "tailwindcss"` and
  `@theme inline`.
- **Path alias:** `@/*` → `./*` is already configured in `tsconfig.json`.
- **Why shadcn/ui:** the app is web-only with no native plans, so gluestack-ui's
  universal (React Native + Web) model adds `react-native-web` overhead for a
  cross-platform payoff that will never be used. shadcn/ui delivers the four things
  that made gluestack appealing — copy-in component ownership, a clean aesthetic,
  utility/Tailwind-style theming, and a broad component catalog — natively on the
  existing Tailwind v4 + React 19 stack with zero RN-Web cost.

## 3. Non-goals

- No real WorldCupDraft screens or features (player pool, leagues, draft board).
- No Convex wiring in the demo page.
- No exhaustive component install — only the small starter set below. Additional
  components are added on demand, per-feature, in later work.

## 4. Theming (token-based)

The theme is **token-based**, layered so the entire app re-skins by editing one
block of CSS variables:

1. **Primitive tokens** — raw color values defined as CSS custom properties in
   `app/globals.css`, under `:root` (light) and `.dark` (dark). Values use `oklch()`
   (shadcn's current default) for perceptually even light/dark variants.
2. **Semantic mapping** — Tailwind v4's `@theme inline` block binds those variables
   to utility classes (`--primary` → `bg-primary`/`text-primary`, etc.).
3. **Component consumption** — components reference only semantic tokens
   (`bg-primary text-primary-foreground`, `bg-card`, `border-border`, …) and never
   hardcode raw colors.

`app/globals.css` is the single source of truth for the theme.

### World Cup palette ("pitch + trophy")

- **Primary → pitch green** (~`green-700`), white foreground — strong contrast for
  buttons.
- **Accent → trophy gold** (~`amber-500`) — highlights, badges, focus touches.
- **Neutral base → stone** (warm grays) — complements green/gold.
- Full light **and** dark variants for every shadcn token (`--background`,
  `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`,
  `--accent`, `--destructive`, `--border`, `--input`, `--ring`, plus the
  `*-foreground` pairs).

Exact values are tuned during implementation and verified live on the demo page;
because they are just variables, any value can be nudged without touching components.

## 5. Components to install (starter set)

Installed via the shadcn CLI into `components/ui/` (owned in-repo):

- `button`
- `card`
- `input`
- `label`
- `badge`
- `dropdown-menu` (backs the theme toggle)
- `sonner` (toast)

Rationale: this set exercises the four interaction categories that surface
integration problems early — a form control (input/label), a surface (card), an
overlay (dropdown-menu), and a portal/notification (sonner) — plus the primitives
(button, badge) that show the palette.

## 6. Dark mode

- Add `next-themes`.
- New `components/theme-provider.tsx` — a client component wrapping
  `next-themes`' `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`,
  `enableSystem`).
- New `components/theme-toggle.tsx` — a `dropdown-menu` + `button` control offering
  Light / Dark / System.
- `app/layout.tsx` — wrap `children` in `ThemeProvider`; add
  `suppressHydrationWarning` to `<html>` to avoid the theme-class hydration warning.
  Existing Geist font wiring and `h-full`/`antialiased` classes are preserved.

## 7. File changes

**New:**
- `components.json` — shadcn config (style, base color, aliases, Tailwind v4 mode).
- `lib/utils.ts` — the `cn()` helper (`clsx` + `tailwind-merge`).
- `components/ui/*` — the installed starter components.
- `components/theme-provider.tsx`
- `components/theme-toggle.tsx`

**Modified:**
- `app/globals.css` — add the full shadcn token set + World Cup palette in `:root`
  and `.dark`, mapped through `@theme inline`. Existing `@import "tailwindcss"` and
  font-variable mappings are kept.
- `app/layout.tsx` — `ThemeProvider` wrap + `suppressHydrationWarning`; update the
  placeholder `metadata` (title/description) to the app name.
- `app/page.tsx` — rebuilt into the demo (see §8).
- `package.json` / `yarn.lock` — new deps (`next-themes`, and the CLI-added
  `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`,
  Radix primitives, `sonner`).

## 8. Demo page (smoke test)

`app/page.tsx` becomes a single client/server-appropriate page that renders:
- The theme toggle (top corner).
- A `Card` containing an `Input` + `Label`, a primary `Button`, a secondary/outline
  `Button`, and a `Badge` (using the accent/gold).
- A button that fires a `sonner` toast (proving the portal + provider work).

The page's only purpose is to visually exercise the palette and the four component
categories. It will be replaced by real screens later.

## 9. Verification

- `yarn dev` → page renders; primary shows pitch green, badge/accent shows trophy
  gold, surfaces use the stone neutral.
- Theme toggle flips light ⇄ dark ⇄ system with **no hydration flash** and no
  console hydration warning.
- Toast fires and is styled by the theme.
- `yarn build` succeeds — catches any RSC / `"use client"` boundary issues from the
  provider and interactive components.

## 10. Risks & mitigations

- **next-themes hydration flash/warning** → mitigated by `suppressHydrationWarning`
  on `<html>` and `attribute="class"`.
- **Tailwind v4 + shadcn CLI:** shadcn supports Tailwind v4 + React 19; the CLI
  writes CSS-variable tokens into `globals.css` rather than a `tailwind.config.js`
  (none exists, and none is needed in v4's CSS-first model). If the CLI's
  auto-detection misfires, tokens are added to `globals.css` manually following the
  same structure.
- **Yarn peer deps under React 19:** if the CLI surfaces peer-dependency warnings,
  resolve via Yarn rather than forcing `--legacy-peer-deps` (an npm flag).
- **Alias already set:** `@/*` exists; `components.json` aliases (`@/components`,
  `@/lib/utils`) align with it — confirm during init, don't duplicate.

## 11. Out of scope / future

- Adding more components per-feature as real screens are built.
- Extracting tokens into a dedicated `tokens.css` if the theme grows (deferred;
  inline-in-`globals.css` is the single source of truth for now).
