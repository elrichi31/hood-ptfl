import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import Database from "better-sqlite3";

// Sign-up is open to the family only: comma-separated emails in ALLOWED_EMAILS.
// Unset/empty = nobody can sign up (fail closed); existing accounts still log in.
const allowed = new Set(
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** Family-shared login (allowlisted self-service sign-up) gating the dashboard — see PRODUCT.md. */
export const auth = betterAuth({
  database: new Database("storage/auth.db"),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!allowed.has(user.email.toLowerCase())) {
            throw new APIError("FORBIDDEN", { message: "Sign-up is invite-only." });
          }
        },
      },
    },
  },
  plugins: [nextCookies()], // keep last: lets server actions set cookies
});
