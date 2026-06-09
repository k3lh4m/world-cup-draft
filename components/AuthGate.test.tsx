// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AuthGate } from "./AuthGate";

// Render both auth branches so we can assert each one's composition.
vi.mock("convex/react", () => ({
  Authenticated: ({ children }: { children: ReactNode }) => <>{children}</>,
  Unauthenticated: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./SignIn", () => ({
  SignIn: ({ next }: { next?: string }) => <div>signin:{next ?? "none"}</div>,
}));
vi.mock("./RequireName", () => ({
  RequireName: ({ children }: { children: ReactNode }) => (
    <div data-testid="require-name">{children}</div>
  ),
}));

describe("AuthGate", () => {
  it("forwards `next` to SignIn on the unauthenticated branch", () => {
    render(
      <AuthGate next="/join/abc">
        <span>dashboard</span>
      </AuthGate>,
    );
    expect(screen.getByText("signin:/join/abc")).toBeInTheDocument();
  });

  it("wraps children in RequireName on the authenticated branch", () => {
    render(
      <AuthGate>
        <span>dashboard</span>
      </AuthGate>,
    );
    const gate = screen.getByTestId("require-name");
    expect(gate).toHaveTextContent("dashboard");
    expect(screen.getByText("signin:none")).toBeInTheDocument();
  });
});
