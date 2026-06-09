import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/membership";

const MAX_NAME_LENGTH = 50;

/**
 * The signed-in user's identity, or null when signed out. Used by the client
 * to decide whether to show the "what's your name?" onboarding step after a
 * magic-link sign-in.
 */
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { _id: user._id, email: user.email, name: user.name };
  },
});

/**
 * Set the signed-in user's global display name. Captured after the first
 * sign-in because Convex Auth's magic-link flow does not carry the name through
 * the email round-trip.
 */
export const setMyName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error("Name cannot be empty");
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new Error(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
    }
    await ctx.db.patch(userId, { name: trimmed });
  },
});
