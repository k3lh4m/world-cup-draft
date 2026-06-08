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

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
