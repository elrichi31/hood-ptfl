import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { NewsIntelligence } from "@/components/news/NewsIntelligence";
import { getMockNewsFeed, type NewsFeed } from "@/lib/news";
import { auth } from "@/lib/auth";
import { backend } from "@/lib/backend";


export default async function News() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const res = await backend("/api/v1/news");
  const live: NewsFeed | null = res.ok ? await res.json() : null;
  // No provider API keys configured yet (or nothing ingested) — fall back to mock data.
  const feed = live && live.events.length ? live : getMockNewsFeed();

  return (
    <AppShell name={session.user.name} email={session.user.email}>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 pt-10 pb-24">
        <NewsIntelligence feed={feed} />
      </main>
    </AppShell>
  );
}
