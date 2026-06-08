"use client";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>World Cup Draft</CardTitle>
            <ThemeToggle />
          </div>
          <CardDescription className="flex items-center gap-2">
            shadcn/ui smoke test
            <Badge className="bg-gold text-gold-foreground">themed</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team">Team name</Label>
            <Input id="team" placeholder="e.g. Sam's Stars" />
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            onClick={() =>
              toast.success("It works!", {
                description: "shadcn/ui + sonner are wired up.",
              })
            }
          >
            Primary
          </Button>
          <Button variant="outline">Outline</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
