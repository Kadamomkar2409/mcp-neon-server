import { getDbClient } from "../src/db/index.js";
import { users, records, auditLogs } from "../src/db/schema.js";
import { sql } from "drizzle-orm";

async function cleanupTestData() {
  const db = getDbClient();

  console.log("================================================================================");
  console.log("  NEON DATABASE: CLEANING UP LEFTOVER TEST DATA");
  console.log("================================================================================");

  // 1. Audit Logs cleanup
  const auditLogsDeleted = await db.execute(sql`
    DELETE FROM audit_logs
    WHERE tool_name = 'test_tool'
       OR user_id IN (
         SELECT id FROM users 
         WHERE email LIKE '%@test.neon' 
            OR email = 'live-tester@example.com'
       )
       OR (user_id IS NULL AND action IN ('CREATE', 'INTEGRATION_TEST'));
  `);
  console.log(`✓ Deleted test audit logs`);

  // 2. Records cleanup
  const recordsDeleted = await db.execute(sql`
    DELETE FROM records
    WHERE title = 'Integration Test Document via HTTP'
       OR title = 'PRD Section 9 Compliance'
       OR title LIKE '%Test Document%'
       OR title LIKE '%Live Cloud Verification%'
       OR title LIKE '%OAuth Verified Document%'
       OR user_id IN (
         SELECT id FROM users 
         WHERE email LIKE '%@test.neon' 
            OR email = 'live-tester@example.com'
       );
  `);
  console.log(`✓ Deleted test records`);

  // 3. Users cleanup
  const usersDeleted = await db.execute(sql`
    DELETE FROM users
    WHERE email LIKE '%@test.neon'
       OR email = 'live-tester@example.com';
  `);
  console.log(`✓ Deleted test users (@test.neon and live-tester@example.com)`);

  // 4. Verification counts
  const remainingUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
  const remainingRecords = await db.select({ count: sql<number>`count(*)` }).from(records);
  const remainingLogs = await db.select({ count: sql<number>`count(*)` }).from(auditLogs);

  console.log("\n--- Remaining Database Contents ---");
  console.log(`Users remaining:      ${Number(remainingUsers[0].count)}`);
  console.log(`Records remaining:    ${Number(remainingRecords[0].count)}`);
  console.log(`Audit logs remaining: ${Number(remainingLogs[0].count)}`);
  console.log("================================================================================");

  process.exit(0);
}

cleanupTestData().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});

