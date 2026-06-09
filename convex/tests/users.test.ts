/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("users.getMe", () => {
  it("returns null when signed out", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.getMe)).resolves.toBeNull();
  });

  it("returns the signed-in user's id, email and name", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Sam", email: "sam@example.com" }),
    );
    const me = await t.withIdentity({ subject: userId }).query(api.users.getMe);
    expect(me).toMatchObject({
      _id: userId,
      name: "Sam",
      email: "sam@example.com",
    });
  });

  it("reports a user with no name yet (name undefined)", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
    const me = await t.withIdentity({ subject: userId }).query(api.users.getMe);
    expect(me?._id).toBe(userId);
    expect(me?.name ?? null).toBeNull();
  });
});

describe("users.setMyName", () => {
  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.setMyName, { name: "Sam" }),
    ).rejects.toThrow(/not authenticated/i);
  });

  it("trims and stores the name; getMe reflects it", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
    const as = t.withIdentity({ subject: userId });
    await as.mutation(api.users.setMyName, { name: "  Sam Kelham  " });
    const me = await as.query(api.users.getMe);
    expect(me?.name).toBe("Sam Kelham");
  });

  it("rejects an empty or whitespace-only name", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
    const as = t.withIdentity({ subject: userId });
    await expect(as.mutation(api.users.setMyName, { name: "" })).rejects.toThrow(
      /name/i,
    );
    await expect(
      as.mutation(api.users.setMyName, { name: "   " }),
    ).rejects.toThrow(/name/i);
  });

  it("rejects a name longer than 50 characters", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
    const as = t.withIdentity({ subject: userId });
    await expect(
      as.mutation(api.users.setMyName, { name: "x".repeat(51) }),
    ).rejects.toThrow(/name/i);
  });
});
