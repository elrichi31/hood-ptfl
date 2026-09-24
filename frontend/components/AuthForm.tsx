"use client";

import { Button, FieldError, Form, Input, Label, Link, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const { error } =
      mode === "login"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: String(form.get("name")) });

    setLoading(false);
    if (error) {
      setError(error.message ?? "Something went wrong.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mode === "signup" && (
        <TextField name="name" isRequired className="flex flex-col gap-1.5">
          <Label className="text-sm text-[var(--muted)]">Name</Label>
          <Input className="w-full" />
        </TextField>
      )}
      <TextField name="email" type="email" isRequired className="flex flex-col gap-1.5">
        <Label className="text-sm text-[var(--muted)]">Email</Label>
        <Input className="w-full" />
      </TextField>
      <TextField name="password" type="password" isRequired minLength={mode === "signup" ? 10 : undefined} className="flex flex-col gap-1.5">
        <Label className="text-sm text-[var(--muted)]">Password</Label>
        <Input className="w-full" />
        <FieldError className="text-sm text-[var(--danger)]" />
      </TextField>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <Button type="submit" variant="primary" fullWidth isDisabled={loading}>
        {loading ? "..." : mode === "login" ? "Sign in" : "Create account"}
      </Button>

      <p className="text-center text-sm text-[var(--muted)]">
        {mode === "login" ? (
          <>
            No account yet? <Link href="/signup">Sign up</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        )}
      </p>
    </Form>
  );
}
