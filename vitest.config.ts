import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // React plugin enables JSX/TSX transform for component tests.
  plugins: [react()],
  test: {
    // Default to node (parser tests read fixtures from disk).
    // Convex function tests opt into edge-runtime via a per-file docblock;
    // React component tests opt into jsdom via `// @vitest-environment jsdom`.
    environment: "node",
    include: [
      "scripts/**/*.test.ts",
      "convex/tests/**/*.test.ts",
      "components/**/*.test.tsx",
    ],
    // Registers @testing-library/jest-dom matchers + auto-cleanup.
    setupFiles: ["./vitest.setup.ts"],
  },
});
