import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as authSchema from "@/lib/auth-schema";

let dbInstance: NodePgDatabase<typeof authSchema> | null = null;

function shouldUseSsl(connectionString: string) {
  try {
    const url = new URL(connectionString);
    const host = url.hostname.toLowerCase();
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  dbInstance = drizzle(pool, { schema: authSchema });
  return dbInstance;
}
