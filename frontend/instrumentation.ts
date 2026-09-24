// Creates/updates the Better Auth tables on boot, so a fresh prod volume just works.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getMigrations } = await import("better-auth/db/migration");
  const { auth } = await import("@/lib/auth");
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}
