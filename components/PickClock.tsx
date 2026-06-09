"use client";

import { useEffect, useState } from "react";
import { secondsRemaining } from "@/convex/lib/clock";

interface PickClockProps {
  pickStartedAt?: number;
  clockSeconds?: number;
}

export function PickClock({ pickStartedAt, clockSeconds }: PickClockProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (pickStartedAt === undefined || clockSeconds === undefined) return null;

  const secs = secondsRemaining(pickStartedAt, clockSeconds, now);
  const urgent = secs <= 10;

  return (
    <span className={urgent ? "font-bold text-red-500" : "text-muted-foreground"}>
      ⏱ {secs}s
    </span>
  );
}
