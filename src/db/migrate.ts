import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDbClient } from "./index.js";
import { logger } from "../utils/logger.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  logger.info("Starting database migrations...");
  try {
    const db = getDbClient();
    const migrationsFolder = path.resolve(__dirname, "../../drizzle");
    await migrate(db, { migrationsFolder });
    logger.info("Database migrations applied successfully.");
  } catch (error) {
    logger.error("Migration failed:", error);
    throw error;
  }
}

// Run directly if invoked from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      logger.info("Migration completed.");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("Migration script encountered fatal error:", err);
      process.exit(1);
    });
}

