import "dotenv/config";
import { migrate, pool } from "./db";
import { migrateLimits } from "./migrate_limits";

async function main() {
  console.log("Starting DB migration...");
  await migrate();
  await migrateLimits();
  console.log("Migration done.");

  // verify tables count
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total_tables FROM information_schema.tables WHERE table_schema = DATABASE()"
  );
  console.log("Tables:", rows);

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
