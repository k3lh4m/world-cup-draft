import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFrom, buildMagicLinkEmail, sendMailerSendEmail } from "../lib/mailerSend";

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

  it("trims surrounding whitespace from the display name", () => {
    expect(parseFrom("   World Cup Draft   <magic@send.kelham.co>")).toEqual({
      name: "World Cup Draft",
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

const samplePayload = {
  from: { name: "World Cup Draft", email: "magic@send.kelham.co" },
  to: [{ email: "player@example.com" }],
  subject: "Sign in to World Cup Draft",
  html: "<p>link</p>",
  text: "link",
};

describe("sendMailerSendEmail", () => {
  it("POSTs to MailerSend with bearer auth and resolves with the message id on 202", async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 202, headers: { "x-message-id": "msg-123" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMailerSendEmail({ apiKey: "key-abc", payload: samplePayload });

    expect(result).toEqual({ messageId: "msg-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mailersend.com/v1/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer key-abc",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(samplePayload),
      }),
    );
  });

  it("throws including MailerSend's message when the API returns a 422 error body", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: "The given data was invalid.",
            errors: { "to.0.email": ["The email must be a valid email address."] },
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendMailerSendEmail({ apiKey: "key-abc", payload: samplePayload }),
    ).rejects.toThrow(/The given data was invalid\./);
  });

  it("falls back to the HTTP status when the error body is not valid JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>500</html>", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendMailerSendEmail({ apiKey: "key-abc", payload: samplePayload }),
    ).rejects.toThrow(/500/);
  });

  it("resolves with messageId undefined when the x-message-id header is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 202 })));
    const result = await sendMailerSendEmail({ apiKey: "key-abc", payload: samplePayload });
    expect(result).toEqual({ messageId: undefined });
  });
});
