import { convexAuth } from "@convex-dev/auth/server";
import Resend from "@auth/core/providers/resend";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Resend({
      // onboarding@resend.dev sends without domain verification for testing.
      // Reads the API key from the AUTH_RESEND_KEY env var on the deployment.
      from: "World Cup Draft <onboarding@resend.dev>",
    }),
  ],
});
