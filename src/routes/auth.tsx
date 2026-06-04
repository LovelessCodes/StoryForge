import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { EmailInput } from "@/components/inputs/email.input";
import { PasswordInput } from "@/components/inputs/password.input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorComponent } from "@/components/ui/error";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).default("signin").catch("signin"),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
  validateSearch: searchSchema,
});

function RouteComponent() {
  const { mode, redirect } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignUp = mode === "signup";

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const res = await authClient.signUp.email(
          { email, password, name },
          {
            onError: (ctx) => {
              setError(ctx.error.message ?? "Sign up failed");
            },
          },
        );
        if (res.error) {
          setError(res.error.message ?? "Sign up failed");
        } else {
          void navigate({ to: redirect ?? "/settings" });
        }
      } else {
        const res = await authClient.signIn.email(
          { email, password },
          {
            onError: (ctx) => {
              setError(ctx.error.message ?? "Sign in failed");
            },
          },
        );
        if (res.error) {
          setError(res.error.message ?? "Sign in failed");
        } else {
          void navigate({ to: redirect ?? "/" });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setError(null);
    void navigate({
      from: Route.fullPath,
      search: {
        mode: isSignUp ? "signin" : "signup",
        redirect,
      },
    });
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{isSignUp ? "Create an account" : "Welcome back"}</CardTitle>
          <CardDescription>
            {isSignUp ? "Enter your details to get started" : "Sign in to your Story Forge account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {isSignUp && (
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <input
                  autoComplete="name"
                  className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full border px-3 py-1 text-sm shadow-xs transition-colors outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  id="name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required={isSignUp}
                  type="text"
                  value={name}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <EmailInput
                autoComplete="email"
                id="email"
                onChange={(e) => setEmail(e.target.value)}
                required
                value={email}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                autoComplete={isSignUp ? "new-password" : "current-password"}
                id="password"
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                required
                value={password}
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>
          <Separator className="my-4" />
          <p className="text-muted-foreground text-center text-sm">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button className="text-primary hover:underline" onClick={toggleMode} type="button">
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
