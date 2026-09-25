import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { auth } from "@/lib/auth";

// Shared shell for every signed-in page: it stays mounted across navigation, so only the
// page content swaps (and shows loading.tsx while the next page's data loads).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return (
    <AppShell name={session.user.name} email={session.user.email}>
      {children}
    </AppShell>
  );
}
