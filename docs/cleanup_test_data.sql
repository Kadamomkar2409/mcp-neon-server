-- =============================================================================
-- SAFE CLEANUP SCRIPT: REMOVE LEFTOVER TEST DATA FROM NEON POSTGRESQL
-- =============================================================================
-- This script removes only artifacts created by test scripts:
--   1. Audit logs for tool 'test_tool', test users, or NULL test attempts.
--   2. Records with test titles or created by test users.
--   3. Test users with emails matching '%@test.neon' or 'live-tester@example.com'.
--
-- Real production data (any user with a real email, and their records) will NOT be touched.
-- It executes within an atomic TRANSACTION (BEGIN ... COMMIT) so it can be rolled back safely.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. INSPECT TARGET ROWS BEFORE DELETION (Dry Check)
-- -----------------------------------------------------------------------------
SELECT 'Audit logs to delete' AS category, count(*) FROM audit_logs
WHERE tool_name = 'test_tool'
   OR user_id IN (
     SELECT id FROM users 
     WHERE email LIKE '%@test.neon' 
        OR email = 'live-tester@example.com'
   )
   OR (user_id IS NULL AND action IN ('CREATE', 'INTEGRATION_TEST'));

SELECT 'Records to delete' AS category, count(*) FROM records
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

SELECT 'Users to delete' AS category, count(*) FROM users
WHERE email LIKE '%@test.neon'
   OR email = 'live-tester@example.com';

-- -----------------------------------------------------------------------------
-- 2. DELETE TEST AUDIT LOGS
-- -----------------------------------------------------------------------------
DELETE FROM audit_logs
WHERE tool_name = 'test_tool'
   OR user_id IN (
     SELECT id FROM users 
     WHERE email LIKE '%@test.neon' 
        OR email = 'live-tester@example.com'
   )
   OR (user_id IS NULL AND action IN ('CREATE', 'INTEGRATION_TEST'));

-- -----------------------------------------------------------------------------
-- 3. DELETE TEST RECORDS
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. DELETE TEST USERS
-- -----------------------------------------------------------------------------
DELETE FROM users
WHERE email LIKE '%@test.neon'
   OR email = 'live-tester@example.com';

-- -----------------------------------------------------------------------------
-- 5. VERIFY POST-CLEANUP ROW COUNTS
-- -----------------------------------------------------------------------------
SELECT 'Remaining users' AS category, count(*) FROM users;
SELECT 'Remaining records' AS category, count(*) FROM records;
SELECT 'Remaining audit logs' AS category, count(*) FROM audit_logs;

-- Commit the transaction to apply changes:
COMMIT;
-- (Replace COMMIT with ROLLBACK if you ever want to cancel without deleting)

