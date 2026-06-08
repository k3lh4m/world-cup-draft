import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default to node (parser tests read fixtures from disk).
    // Convex function tests opt into edge-runtime via a per-file docblock.
    environment: "node",
    include: ["scripts/**/*.test.ts", "convex/tests/**/*.test.ts"],
  },
});
