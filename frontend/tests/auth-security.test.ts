// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { auth as AppAuth } from "@/lib/auth";

// Use the real authentication implementation with an isolated in-memory database.
vi.mock("better-sqlite3", async (importOriginal) => {
  const actual = await importOriginal<{
    default: typeof import("better-sqlite3");
  }>();
  const database = new actual.default(":memory:");
  const { getMigrations } = await import("better-auth/db/migration");
  await (await getMigrations({ database })).runMigrations();
  return {
    default: vi.fn(function TestDatabase() {
      return database;
    }),
  };
});
// Next's cookie plugin needs a live request context; test the HTTP auth handler itself.
vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "test-cookies" }),
}));
let auth: typeof AppAuth;
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "isolated-auth-test-secret-not-for-production-123456",
  );
  vi.stubEnv("ALLOWED_EMAILS", "unregistered@example.com,existing@example.com");
  ({ auth } = await import("@/lib/auth"));
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      name: "Existing user",
      email: "existing@example.com",
      emailVerified: false,
    },
    { method: "admin" },
  );
  await ctx.internalAdapter.createAccount({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await ctx.password.hash("existing-test-password"),
  });
});
afterAll(() => {
  (auth.options.database as { close(): void }).close();
  vi.unstubAllEnvs();
});
const request = (path: string, body: object) =>
  auth.handler(
    new Request(`http://localhost:3000/api/auth/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify(body),
    }),
  );
it("rejects direct public signup even for an allowlisted unregistered email", async () => {
  const res = await request("sign-up/email", {
    name: "Imposter",
    email: "unregistered@example.com",
    password: "attacker-test-password",
  });
  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  expect(
    await (
      await auth.$context
    ).internalAdapter.findUserByEmail("unregistered@example.com"),
  ).toBeNull();
});
it("preserves sign-in and session creation for existing accounts", async () => {
  const res = await request("sign-in/email", {
    email: "existing@example.com",
    password: "existing-test-password",
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toContain("session_token");
  expect((await res.json()).user.email).toBe("existing@example.com");
});
