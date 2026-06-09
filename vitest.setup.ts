// Test harness setup for React component tests (jsdom environment).
// Imported via vitest `setupFiles`. The jest-dom matchers (toBeInTheDocument,
// toHaveTextContent, …) are registered for the whole suite; the automatic
// cleanup after each test prevents rendered components from leaking between tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
