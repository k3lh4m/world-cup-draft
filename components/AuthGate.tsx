"use client";

import { Authenticated, Unauthenticated } from "convex/react";
import type { ReactNode } from "react";

import { RequireName } from "@/components/RequireName";
import { SignIn } from "@/components/SignIn";

/**
 * Wraps protected content with the auth flow: shows the magic-link sign-in when
 * signed out, and gates behind the name-capture step once signed in. `next` is
 * the post-sign-in redirect for the invite flow.
 */
export function AuthGate({
  children,
  next,
}: {
  children: ReactNode;
  next?: string;
}) {
  return (
    <>
      <Unauthenticated>
        <SignIn next={next} />
      </Unauthenticated>
      <Authenticated>
        <RequireName>{children}</RequireName>
      </Authenticated>
    </>
  );
}
