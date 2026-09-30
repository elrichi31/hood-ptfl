import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import Database from "better-sqlite3";

/** Shared dashboard: public registration is closed; existing accounts can still sign in. */
export const auth = betterAuth({
  database: new Database("storage/auth.db"),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    disableSignUp: true,
  },
  // Behind Cloudflare: rate-limit per real client IP, not one shared bucket.
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  plugins: [nextCookies()], // keep last: lets server actions set cookies
});
