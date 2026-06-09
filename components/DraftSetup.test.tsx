// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DraftSetup } from "./DraftSetup";
import { type Id } from "@/convex/_generated/dataModel";

// The component makes exactly one useQuery call (listMyLeagues); return the
// value held in `myLeagues`. useMutation is unused by these render assertions.
let myLeagues: unknown;
vi.mock("convex/react", () => ({
  useQuery: () => myLeagues,
  useMutation: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const leagueId = "lg1" as unknown as Id<"leagues">;
const memberIds = ["m1"] as unknown as Id<"memberships">[];

function leaguesWithRole(role: "commissioner" | "member") {
  return [{ league: { _id: "lg1" }, membership: { role } }];
}

beforeEach(() => {
  myLeagues = undefined;
});

describe("DraftSetup", () => {
  it("shows the draft config + Start draft button to the commissioner", () => {
    myLeagues = leaguesWithRole("commissioner");
    render(<DraftSetup leagueId={leagueId} memberIds={memberIds} />);

    expect(screen.getByRole("button", { name: /start draft/i })).toBeInTheDocument();
    expect(screen.queryByText(/waiting for the commissioner/i)).not.toBeInTheDocument();
  });

  it("shows a waiting message (no controls) to a non-commissioner member", () => {
    myLeagues = leaguesWithRole("member");
    render(<DraftSetup leagueId={leagueId} memberIds={memberIds} />);

    expect(screen.getByText(/waiting for the commissioner/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start draft/i })).not.toBeInTheDocument();
  });

  it("renders nothing while the role is still loading", () => {
    myLeagues = undefined;
    const { container } = render(<DraftSetup leagueId={leagueId} memberIds={memberIds} />);

    expect(container).toBeEmptyDOMElement();
  });
});
