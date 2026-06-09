import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFrom, buildMagicLinkEmail } from "../lib/mailerSend";

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

describe("buildMagicLinkEmail", () => {
  const url = "https://worldcupdraft.example/api/auth/verify?token=abc123";

  it("builds a payload with parsed from, to, subject, and the url in html and text", () => {
    const payload = buildMagicLinkEmail({
      to: "player@example.com",
      url,
      from: "World Cup Draft <magic@send.kelham.co>",
    });

    expect(payload.from).toEqual({ name: "World Cup Draft", email: "magic@send.kelham.co" });
    expect(payload.to).toEqual([{ email: "player@example.com" }]);
    expect(payload.subject).toBe("Sign in to World Cup Draft");
    expect(payload.html).toContain(url);
    expect(payload.text).toContain(url);
  });
});
