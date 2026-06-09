"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "magic" | "password";
type PasswordFlow = "signIn" | "signUp";

/** Map Convex Auth's generic password errors to friendly copy. */
function passwordErrorMessage(err: unknown, flow: PasswordFlow): string {
  const msg = err instanceof Error ? err.message : "";
  if (/InvalidSecret|InvalidAccountId/i.test(msg)) {
    return "Incorrect email or password.";
  }
  if (/already|exists/i.test(msg)) {
    return "An account with this email already exists — try signing in.";
  }
  if (flow === "signUp" && /8|short|length|password/i.test(msg)) {
    return "Password must be at least 8 characters.";
  }
  return msg || "Something went wrong. Please try again.";
}

/**
 * Passwordless magic-link sign-in (default) plus an email + password panel for
 * creating test accounts without sending email. The same flows sign in returning
 * users and create new ones; `next` is forwarded as the post-sign-in redirect.
 */
export function SignIn({ next }: { next?: string }) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>("magic");
  const [passwordFlow, setPasswordFlow] = useState<PasswordFlow>("signIn");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onMagicSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");
    if (next) formData.set("redirectTo", next);
    setSending(true);
    try {
      await signIn("mailersend", formData);
      setSentTo(email);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not send the sign-in link",
      );
    } finally {
      setSending(false);
    }
  }

  async function onPasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("flow", passwordFlow);
    if (next) formData.set("redirectTo", next);
    setSending(true);
    try {
      await signIn("password", formData);
      // Authenticated immediately — AuthGate/RequireName take over.
    } catch (err) {
      toast.error(passwordErrorMessage(err, passwordFlow));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-3xl" aria-hidden>
          ⚽
        </span>
        <h1 className="font-heading text-xl font-semibold">World Cup Draft</h1>
        <p className="text-muted-foreground text-sm">
          Draft your squad and compete with friends.
        </p>
      </div>

      {sentTo ? (
        <Card>
          <CardHeader>
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>
              We sent a sign-in link to{" "}
              <span className="text-foreground font-medium">{sentTo}</span>.
              Click it to finish signing in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="ghost"
              className="px-0"
              onClick={() => setSentTo(null)}
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      ) : mode === "magic" ? (
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a magic link — no password
              needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form className="flex flex-col gap-4" onSubmit={onMagicSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <Button type="submit" disabled={sending}>
                {sending ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
            <Button
              type="button"
              variant="link"
              className="self-center px-0"
              onClick={() => setMode("password")}
            >
              Use a password instead
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {passwordFlow === "signIn" ? "Sign in" : "Create account"}
            </CardTitle>
            <CardDescription>
              {passwordFlow === "signIn"
                ? "Use your email and password."
                : "Pick an email and password to create a test account."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form className="flex flex-col gap-4" onSubmit={onPasswordSubmit}>
              <div className="space-y-2">
                <Label htmlFor="pw-email">Email</Label>
                <Input
                  id="pw-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw-password">Password</Label>
                <Input
                  id="pw-password"
                  name="password"
                  type="password"
                  autoComplete={
                    passwordFlow === "signIn"
                      ? "current-password"
                      : "new-password"
                  }
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
                <p className="text-muted-foreground text-xs">
                  At least 8 characters.
                </p>
              </div>
              <Button type="submit" disabled={sending}>
                {sending
                  ? "Please wait…"
                  : passwordFlow === "signIn"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>
            <div className="flex flex-col items-center gap-1">
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() =>
                  setPasswordFlow(passwordFlow === "signIn" ? "signUp" : "signIn")
                }
              >
                {passwordFlow === "signIn" ? "Create an account" : "Sign in instead"}
              </Button>
              <Button
                type="button"
                variant="link"
                className="text-muted-foreground px-0"
                onClick={() => setMode("magic")}
              >
                Back to magic link
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
