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

/**
 * Passwordless magic-link sign-in. The same flow signs in returning users and
 * creates new ones, so there is no separate "create account" screen. `next` is
 * forwarded as the post-sign-in redirect (used by the invite flow).
 */
export function SignIn({ next }: { next?: string }) {
  const { signIn } = useAuthActions();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "");
    if (next) formData.set("redirectTo", next);
    setSending(true);
    try {
      await signIn("resend", formData);
      setSentTo(email);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not send the sign-in link",
      );
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a magic link — no password
              needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
