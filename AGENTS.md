<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Use Zod for data shapes — not interfaces/types

Define data shapes as Zod schemas, not TypeScript `interface`/`type`. Derive the
static type from the schema so the schema is the single source of truth:

```ts
import { z } from "zod";

export const PoolPlayerSchema = z.object({
  name: z.string(),
  position: PosSchema,
  espnPlayerId: z.number().optional(),
});
export type PoolPlayer = z.infer<typeof PoolPlayerSchema>;
```

Rules:
- **No `interface` / `type` for data shapes.** Write a `*Schema` and `z.infer` the type.
  Plain `type` aliases for non-data unions/generics/utility types are still fine.
- **Validate external data at boundaries with `.parse()`** — anything from `fetch`,
  files, or `JSON.parse` (ESPN APIs, `data/*.json`). Type the input as `unknown` and
  parse; never trust an upstream shape with `any`.
- Export the `*Schema` alongside its inferred type so other modules can reuse and parse.
- **Exception — Convex.** `convex/schema.ts` and Convex function `args` use Convex's
  own `v` validators (`convex/values`); Convex requires these, so do not replace them
  with Zod. Zod is for everything else (parsers, scripts, API responses).

# Convex testing gotchas (vitest + convex-test)

`convex-test` runs in-process and resolves functions via an `import.meta.glob("../**/*.ts")`
modules list against the `anyApi` proxy — it does NOT use the deployment or the generated
types. Consequences that have repeatedly caused confusion:

- **Green tests ≠ green typecheck for new functions.** A brand-new `convex/<module>.ts`
  makes `api.<module>.*` resolve at runtime (glob), so its tests pass before
  `convex/_generated/api.d.ts` knows about it. `yarn build` / `tsc` will still fail with
  "Property '<module>' does not exist on api" until codegen runs. Treat tests and types as
  independent gates; codegen needs `CONVEX_DEPLOYMENT` (see the CLAUDE.md Convex caveat —
  prefer deferring codegen/build until merge).
- **RED for a not-yet-created function shows a framework error, not your domain error.**
  `rejects.toThrow(/your message/i)` against a missing export fails with "Expected a Convex
  function exported from module … but there is no such export". That IS a valid RED (the
  implementation is missing). Only once the export exists does a regex mismatch mean the
  assertion wording is wrong.
- **The scheduler never fires in convex-test.** `ctx.scheduler.runAfter(...)` is accepted but
  never executed, so a bug that arms a job unconditionally is invisible. For any conditional
  scheduling, add a test asserting the *absence* of a job (e.g. `doc.jobId === undefined`) for
  the no-job path, and invoke scheduled `internalMutation`s directly to test their effects.
- **Global vs league-scoped data in assertions.** Tables like `players` are a global pool
  (no `leagueId`); "full availability" for a fresh league = *all* rows in the test DB minus
  that league's exclusions, not just the rows you seeded "for" it. Verify length assertions
  against the actual data-model scope.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`yarn convex ai-files install`.

<!-- convex-ai-end -->
