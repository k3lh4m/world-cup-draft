"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

export function SignIn({ next }: { next?: string }) {
  const { signIn } = useAuthActions();
  const [sent, setSent] = useState(false);
  if (sent) return <p className="p-4">Check your email for a sign-in link.</p>;
  return (
    <form
      className="flex flex-col gap-2 p-4 max-w-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (next) fd.set("redirectTo", next);
        await signIn("resend", fd);
        setSent(true);
      }}
    >
      <input
        name="email"
        type="email"
        required
        placeholder="you@example.com"
        className="border rounded px-3 py-2"
      />
      <button className="bg-black text-white rounded px-3 py-2" type="submit">
        Email me a sign-in link
      </button>
    </form>
  );
}
