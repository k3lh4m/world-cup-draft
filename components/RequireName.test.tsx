// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequireName } from "./RequireName";

// Mock the Convex React hooks so the component renders without a live backend.
const useQueryMock = vi.fn();
const setMyNameMock = vi.fn().mockResolvedValue(undefined);
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: () => setMyNameMock,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

beforeEach(() => {
  useQueryMock.mockReset();
  setMyNameMock.mockClear();
});

describe("RequireName", () => {
  it("renders nothing while the current user is loading", () => {
    useQueryMock.mockReturnValue(undefined);
    const { container } = render(
      <RequireName>
        <div>protected</div>
      </RequireName>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders children when the user already has a name", () => {
    useQueryMock.mockReturnValue({ _id: "u1", name: "Sam" });
    render(
      <RequireName>
        <div>protected</div>
      </RequireName>,
    );
    expect(screen.getByText("protected")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the name form (not children) when the user has no name", () => {
    useQueryMock.mockReturnValue({ _id: "u1", name: undefined });
    render(
      <RequireName>
        <div>protected</div>
      </RequireName>,
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.queryByText("protected")).not.toBeInTheDocument();
  });

  it("submits the trimmed name via setMyName", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({ _id: "u1", name: undefined });
    render(
      <RequireName>
        <div>protected</div>
      </RequireName>,
    );
    await user.type(screen.getByRole("textbox"), "  Sam Kelham  ");
    await user.click(screen.getByRole("button"));
    expect(setMyNameMock).toHaveBeenCalledWith({ name: "Sam Kelham" });
  });
});
