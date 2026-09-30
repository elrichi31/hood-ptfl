"use client";

import { Button, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";

export function AuthForm() {
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

    const { error } = await signIn.email({ email, password });

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
      <TextField name="email" type="email" isRequired className="flex flex-col gap-1.5">
        <Label className="text-sm text-[var(--muted)]">Email</Label>
        <Input className="w-full" />
      </TextField>
      <TextField name="password" type="password" isRequired className="flex flex-col gap-1.5">
        <Label className="text-sm text-[var(--muted)]">Password</Label>
        <Input className="w-full" />
        <FieldError className="text-sm text-[var(--danger)]" />
      </TextField>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <Button type="submit" variant="primary" fullWidth isDisabled={loading}>
        {loading ? "..." : "Sign in"}
      </Button>

      <p className="text-center text-sm text-[var(--muted)]">Public registration is closed.</p>
    </Form>
  );
}
