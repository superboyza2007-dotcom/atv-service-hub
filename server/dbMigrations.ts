import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getDb } from "./db";

let migrationPromise: Promise<void> | undefined;

/**
 * Apply checked-in migrations before the app starts serving requests.
 * This prevents a newly deployed API from writing against an older database
 * schema, which is especially important for the server-owned repair records.
 */
export function ensureDatabaseMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) return Promise.resolve();
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const db = await getDb();
      if (!db) throw new Error("DATABASE_URL is configured but the database is unavailable");
      await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
      console.log("[Database] Migrations applied");
    })().catch(error => {
      migrationPromise = undefined;
      throw error;
    });
  }
  return migrationPromise;
}
