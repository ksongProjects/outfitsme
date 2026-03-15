import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins/jwt";

import * as authSchema from "@/lib/auth-schema";
import { getDb } from "@/lib/db";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

function createAuth() {
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
  const googleClientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const googleClientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");
  const authSecret = getRequiredEnv("BETTER_AUTH_SECRET");

  return betterAuth({
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
}

type AuthInstance = ReturnType<typeof createAuth>;

let authInstance: AuthInstance | null = null;

export function getAuth(): AuthInstance {
  if (!authInstance) {
    authInstance = createAuth();
  }

  return authInstance;
}

export type AuthSession = ReturnType<typeof createAuth>["$Infer"]["Session"];
