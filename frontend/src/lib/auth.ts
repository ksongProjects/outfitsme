import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins/jwt";

import * as authSchema from "@/lib/auth-schema";
import { getDb } from "@/lib/db";

const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const authSecret = process.env.BETTER_AUTH_SECRET;

if (!googleClientId || !googleClientSecret) {
  throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required");
}

if (!authSecret) {
  throw new Error("BETTER_AUTH_SECRET environment variable is required");
}

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    usePlural: true,
    camelCase: true,
    schema: authSchema,
  }),
  plugins: [jwt()],
  socialProviders: {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    },
  },
  baseURL: appUrl,
  basePath: "/api/auth",
  secret: authSecret,
});

export type AuthSession = typeof auth.$Infer.Session;
