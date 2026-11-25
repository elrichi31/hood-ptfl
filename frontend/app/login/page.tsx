import { ZenlorMark } from "@/components/ZenlorMark";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-6">
      <div className="w-full max-w-[340px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)]">
            <ZenlorMark size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Zenlor Labs</h1>
          <p className="text-sm text-[var(--muted)]">Private Market Analytics — authorized users only</p>
        </div>
        <AuthForm />
        <p className="mt-8 text-center text-xs leading-relaxed text-[var(--muted)]">
          Zenlor Labs is an independent, private analytics tool. It is not affiliated with, endorsed
          by, or operated by Robinhood Markets, Inc. or any of its affiliates. Robinhood is a
          trademark of its respective owner. This site never asks for your Robinhood credentials.
        </p>
      </div>
    </main>
  );
}
