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
      </div>
    </main>
  );
}
