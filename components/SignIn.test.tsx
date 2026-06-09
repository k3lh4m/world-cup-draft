// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignIn } from "./SignIn";

const signInMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: signInMock }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

beforeEach(() => {
  signInMock.mockClear();
});

describe("SignIn", () => {
  it("renders the email form", () => {
    render(<SignIn />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeInTheDocument();
  });

  it("calls signIn('mailersend', …) with the email and shows the sent state", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.type(screen.getByLabelText(/email/i), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    const [provider, formData] = signInMock.mock.calls[0];
    expect(provider).toBe("mailersend");
    expect((formData as FormData).get("email")).toBe("sam@example.com");

    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
  });

  it("forwards `next` as redirectTo", async () => {
    const user = userEvent.setup();
    render(<SignIn next="/join/abc" />);
    await user.type(screen.getByLabelText(/email/i), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    const formData = signInMock.mock.calls[0][1] as FormData;
    expect(formData.get("redirectTo")).toBe("/join/abc");
  });

  it("'use a different email' returns to the form", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.type(screen.getByLabelText(/email/i), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    await screen.findByText(/check your inbox/i);

    await user.click(screen.getByRole("button", { name: /different email/i }));
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});

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
