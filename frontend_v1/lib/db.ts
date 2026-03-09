import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  dbInstance = drizzle(pool);
  return dbInstance;
}

// For backwards compatibility
export const db = new Proxy(
  {},
  {
    get: () => {
      return getDb();
    },
  }
) as any;
