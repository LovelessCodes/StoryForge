import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth";

const signInSchema = z.object({
  email: z.email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signUpSchema = signInSchema.extend({
  name: z.string().min(1, "Name is required"),
});

type FieldName = "email" | "password" | "name";
type FieldErrors = Partial<Record<FieldName, string>>;

const emptyValues: Record<FieldName, string> = { email: "", password: "", name: "" };

/** Map the first zod issue per field onto the field name. */
function collectErrors(schema: z.ZodType, values: Record<FieldName, string>): FieldErrors {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if ((key === "email" || key === "password" || key === "name") && errors[key] === undefined) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

/** Read `mode` and `redirect` from the URL search string. */
function useAuthSearch() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const params = new URLSearchParams(searchStr);
  const mode = params.get("mode") === "signup" ? "signup" : "signin";
  const rawRedirect = params.get("redirect");
  // Only allow same-app absolute paths.
  const redirect =
    rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : null;
  return { mode, redirect };
}

export default function AuthPage() {
  const { mode, redirect } = useAuthSearch();
  const navigate = useNavigate();
  const isSignUp = mode === "signup";

  const [values, setValues] = useState<Record<FieldName, string>>(emptyValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setValue(field: FieldName, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors = collectErrors(isSignUp ? signUpSchema : signInSchema, values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          email: values.email,
          name: values.name,
          password: values.password,
        });
        if (result.error) {
          setFormError(result.error.message ?? "Sign up failed");
        } else {
          void navigate({ to: (redirect ?? "/settings") as "/settings" });
        }
      } else {
        const result = await authClient.signIn.email({
          email: values.email,
          password: values.password,
        });
        if (result.error) {
          setFormError(result.error.message ?? "Sign in failed");
        } else {
          void navigate({ to: (redirect ?? "/settings") as "/settings" });
        }
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleMode() {
    setFormError(null);
    setErrors({});
    const nextMode = isSignUp ? "signin" : "signup";
    void navigate({
      to: "/auth",
      search: redirect ? { mode: nextMode, redirect } : { mode: nextMode },
    });
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{isSignUp ? "Create an account" : "Welcome back"}</CardTitle>
          <CardDescription>
            {isSignUp
              ? "Enter your details to get started."
              : "Sign in to your Story Forge account. Optional — the app works offline."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
            {isSignUp && (
              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="name">
                  Name
                </label>
                <Input
                  autoComplete="name"
                  id="name"
                  onChange={(event) => setValue("name", event.target.value)}
                  placeholder="Your name"
                  required
                  type="text"
                  value={values.name}
                />
                {errors.name && <p className="text-destructive text-[11px]">{errors.name}</p>}
              </div>
            )}

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="email">
                Email
              </label>
              <Input
                autoComplete="email"
                id="email"
                onChange={(event) => setValue("email", event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={values.email}
              />
              {errors.email && <p className="text-destructive text-[11px]">{errors.email}</p>}
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="password">
                Password
              </label>
              <Input
                autoComplete={isSignUp ? "new-password" : "current-password"}
                id="password"
                minLength={8}
                onChange={(event) => setValue("password", event.target.value)}
                required
                type="password"
                value={values.password}
              />
              {errors.password && <p className="text-destructive text-[11px]">{errors.password}</p>}
            </div>

            {formError && <p className="text-destructive text-xs">{formError}</p>}

            <Button className="w-full" disabled={submitting} type="submit" variant="accent-primary">
              {submitting ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>

          <Separator className="my-4" />

          <p className="text-muted-foreground text-center text-xs">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              className="text-accent-primary hover:underline"
              onClick={toggleMode}
              type="button"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
