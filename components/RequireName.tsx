"use client";

import { useMutation, useQuery } from "convex/react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
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
 * Gates its children behind a global display name. Rendered inside
 * `<Authenticated>`: if the signed-in user has no name yet (the magic-link flow
 * can't carry it through the email round-trip), it shows a one-field capture
 * step instead of the children.
 */
export function RequireName({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.getMe);
  const setMyName = useMutation(api.users.setMyName);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Still loading, or briefly unauthenticated — render nothing to avoid a flash.
  if (me === undefined || me === null) return null;
  if (me.name) return <>{children}</>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await setMyName({ name: trimmed });
      // On success the `getMe` subscription updates and children render.
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save your name",
      );
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>What should we call you?</CardTitle>
          <CardDescription>
            This name is shown to the rest of your league.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="display-name">Your name</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sam"
                autoFocus
                required
              />
            </div>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
