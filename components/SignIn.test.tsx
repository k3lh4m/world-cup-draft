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
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls signIn('resend', …) with the email and shows the sent state", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.type(screen.getByLabelText(/email/i), "sam@example.com");
    await user.click(screen.getByRole("button"));

    const [provider, formData] = signInMock.mock.calls[0];
    expect(provider).toBe("resend");
    expect((formData as FormData).get("email")).toBe("sam@example.com");

    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
  });

  it("forwards `next` as redirectTo", async () => {
    const user = userEvent.setup();
    render(<SignIn next="/join/abc" />);
    await user.type(screen.getByLabelText(/email/i), "sam@example.com");
    await user.click(screen.getByRole("button"));
    const formData = signInMock.mock.calls[0][1] as FormData;
    expect(formData.get("redirectTo")).toBe("/join/abc");
  });

  it("'use a different email' returns to the form", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.type(screen.getByLabelText(/email/i), "sam@example.com");
    await user.click(screen.getByRole("button"));
    await screen.findByText(/check your inbox/i);

    await user.click(screen.getByRole("button", { name: /different email/i }));
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});
