import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins/jwt";
import { sql } from "drizzle-orm";

import * as authSchema from "@/lib/auth-schema";
import { getDb } from "@/lib/db";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

function buildTrustedOrigins(appUrl: string): string[] {
  const candidates = [
    appUrl,
    process.env.APP_URL || "",
    process.env.NEXT_PUBLIC_APP_URL || "",
    process.env.BETTER_AUTH_URL || "",
  ];
  const origins = new Set<string>();

  for (const candidate of candidates) {
    const value = candidate.trim();
    if (!value) {
      continue;
    }

    try {
      const parsed = new URL(value);
      origins.add(parsed.origin);

      if (parsed.hostname.startsWith("www.")) {
        origins.add(`${parsed.protocol}//${parsed.hostname.slice(4)}${parsed.port ? `:${parsed.port}` : ""}`);
      } else {
        origins.add(`${parsed.protocol}//www.${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`);
      }
    } catch {
      continue;
    }
  }

  return Array.from(origins);
}

async function ensureDefaultAppUserRows(userId: string) {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return;
  }

  await getDb().execute(sql`
    insert into public.user_settings (
      user_id,
      user_role,
      profile_gender,
      profile_photo_path,
      enable_outfit_image_generation,
      enable_online_store_search,
      enable_accessory_analysis
    )
    values (
      ${normalizedUserId},
      'trial',
      '',
      '',
      false,
      false,
      false
    )
    on conflict (user_id) do nothing
  `);
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
        disableImplicitSignUp: false,
      },
    },
    account: {
      // Keep OAuth state in an encrypted cookie so sign-in start does not depend
      // on a database write succeeding before we can redirect to Google.
      storeStateStrategy: "cookie",
    },
    databaseHooks: {
      user: {
        create: {
          async after(user) {
            if (!user?.id) {
              return;
            }

            await ensureDefaultAppUserRows(user.id);
          },
        },
      },
    },
    session: {
      expiresIn: 60 * 60,
    },
    trustedOrigins: buildTrustedOrigins(appUrl),
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
