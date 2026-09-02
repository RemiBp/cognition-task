import { closeSync, existsSync, openSync } from "node:fs";
import { join } from "node:path";

const testDatabase = join(process.cwd(), "prisma", "test.db");

if (!existsSync(testDatabase)) {
  closeSync(openSync(testDatabase, "w"));
}
