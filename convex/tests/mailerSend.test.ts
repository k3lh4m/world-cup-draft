import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFrom } from "../lib/mailerSend";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseFrom", () => {
  it('parses "Display Name <addr@domain>" into name + email', () => {
    expect(parseFrom("World Cup Draft <magic@send.kelham.co>")).toEqual({
      name: "World Cup Draft",
      email: "magic@send.kelham.co",
    });
  });

  it("parses a bare address into just an email", () => {
    expect(parseFrom("magic@send.kelham.co")).toEqual({
      email: "magic@send.kelham.co",
    });
  });
});
