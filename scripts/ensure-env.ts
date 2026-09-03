import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env");

if (!existsSync(envPath) && !process.env.DATABASE_URL) {
  writeFileSync(envPath, 'DATABASE_URL="file:./dev.db"\n');
  console.log("Created .env with the local SQLite database.");
}
