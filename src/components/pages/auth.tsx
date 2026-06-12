import { useForm } from "@tanstack/react-form";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";

import { EmailInput } from "@/components/inputs/email.input";
import { PasswordInput } from "@/components/inputs/password.input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth";

const authSchema = z.object({
  email: z.email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string(),
});

/** Display a field-level validation error message regardless of its shape. */
function FieldError({ error }: { error: unknown }) {
  const message =
    typeof error === "string" ? error : ((error as { message?: string })?.message ?? String(error));
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

export function AuthPage() {
  const { mode, redirect } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === "signup";

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        if (isSignUp) {
          const res = await authClient.signUp.email(
            { email: value.email, password: value.password, name: value.name },
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
            { email: value.email, password: value.password },
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
      }
    },
    validators: {
      onChange: authSchema,
    },
  });

  const toggleMode = () => {
    setError(null);
    void navigate({
      from: "/auth",
      search: {
        mode: isSignUp ? "signin" : "signup",
        redirect,
      },
    });
  };

  return (
    <div className="flex size-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{isSignUp ? "Create an account" : "Welcome back"}</CardTitle>
          <CardDescription>
            {isSignUp ? "Enter your details to get started" : "Sign in to your Story Forge account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
          >
            {isSignUp && (
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) => (!value ? "Name is required" : undefined),
                }}
              >
                {(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      aria-label="Name"
                      autoComplete="name"
                      id="name"
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Your name"
                      type="text"
                      value={field.state.value}
                    />
                    {field.state.meta.errors.map((err, i) => (
                      // react-doctor-disable-next-line react-doctor/no-array-index-as-key
                      <FieldError error={err} key={i} />
                    ))}
                  </div>
                )}
              </form.Field>
            )}

            <form.Field name="email">
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <EmailInput
                    autoComplete="email"
                    id="email"
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((err, i) => (
                    <FieldError error={err} key={i} />
                  ))}
                </div>
              )}
            </form.Field>

            <form.Field name="password">
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <PasswordInput
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    id="password"
                    minLength={8}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((err, i) => (
                    <FieldError error={err} key={i} />
                  ))}
                </div>
              )}
            </form.Field>

            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button className="w-full" disabled={form.state.isSubmitting} type="submit">
              {form.state.isSubmitting ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
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
