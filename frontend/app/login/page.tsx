import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-6">
      <div className="w-full max-w-[340px]">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--accent)] text-lg font-semibold text-[var(--accent-foreground)]">
            P
          </div>
          <h1 className="text-xl font-semibold">Sign in to Portfolio</h1>
        </div>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
