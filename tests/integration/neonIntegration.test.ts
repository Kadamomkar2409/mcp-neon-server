import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { recordService } from "../../src/services/recordService.js";
import { auditService } from "../../src/services/auditService.js";
import { statsService } from "../../src/services/statsService.js";
import { systemService } from "../../src/services/systemService.js";
import { checkDatabaseHealth, getDbClient } from "../../src/db/index.js";
import { users, records, auditLogs } from "../../src/db/schema.js";
import { eq, inArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

describe("Neon PostgreSQL Integration Tests", () => {
  const userA = {
    userId: randomUUID(),
    email: `usera-${Date.now()}@test.neon`,
    name: "User Alpha",
  };

  const userB = {
    userId: randomUUID(),
    email: `userb-${Date.now()}@test.neon`,
    name: "User Beta",
  };

  let createdRecordId: string;

  beforeAll(async () => {
    // Check that Neon is reachable
    const health = await checkDatabaseHealth(5000);
    expect(health.healthy).toBe(true);
  });

  it("1. Verifies Neon database connectivity and health", async () => {
    const health = await checkDatabaseHealth();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThan(0);
  });

  it("2. Creates a record for User A in Neon database", async () => {
    const record = await recordService.createRecord({
      userId: userA.userId,
      userEmail: userA.email,
      userName: userA.name,
      title: "Quarterly Financial Analysis",
      description: "Comprehensive review of Q3 performance and forecasting for Q4",
      metadata: { priority: "high", tags: ["finance", "q3"] },
    });

    expect(record.id).toBeDefined();
    expect(record.userId).toBe(userA.userId);
    expect(record.title).toBe("Quarterly Financial Analysis");
    expect(record.metadata).toEqual({ priority: "high", tags: ["finance", "q3"] });

    createdRecordId = record.id;
  });

  it("3. Retrieves the record by ID for the authorized owner (User A)", async () => {
    const record = await recordService.getRecord({
      userId: userA.userId,
      recordId: createdRecordId,
    });

    expect(record.id).toBe(createdRecordId);
    expect(record.title).toBe("Quarterly Financial Analysis");
  });

  it("4. Multi-tenancy check: Prevents User B from accessing User A's record", async () => {
    await expect(
      recordService.getRecord({
        userId: userB.userId,
        recordId: createdRecordId,
      })
    ).rejects.toThrow("Forbidden");
  });

  it("5. Lists records with pagination and filtering for User A", async () => {
    const result = await recordService.listRecords({
      userId: userA.userId,
      limit: 10,
      offset: 0,
      titleFilter: "Financial",
    });

    expect(result.records.length).toBeGreaterThanOrEqual(1);
    expect(result.pagination.total).toBeGreaterThanOrEqual(1);
    expect(result.records[0].title).toContain("Financial");
  });

  it("6. Searches records by keyword query for User A", async () => {
    const result = await recordService.searchRecords({
      userId: userA.userId,
      query: "forecasting",
    });

    expect(result.records.length).toBeGreaterThanOrEqual(1);
    expect(result.records[0].id).toBe(createdRecordId);
  });

  it("7. Updates the record for the owner", async () => {
    const updated = await recordService.updateRecord({
      userId: userA.userId,
      recordId: createdRecordId,
      title: "Updated Quarterly Financial Analysis",
      description: "Updated description with final numbers",
    });

    expect(updated.id).toBe(createdRecordId);
    expect(updated.title).toBe("Updated Quarterly Financial Analysis");
    expect(updated.description).toBe("Updated description with final numbers");
  });

  it("8. Multi-tenancy check: Prevents User B from updating User A's record", async () => {
    await expect(
      recordService.updateRecord({
        userId: userB.userId,
        recordId: createdRecordId,
        title: "Malicious Update",
      })
    ).rejects.toThrow("Forbidden");
  });

  it("9. Writes and queries real audit logs", async () => {
    await auditService.recordAudit({
      userId: userA.userId,
      toolName: "test_tool",
      action: "INTEGRATION_TEST",
      status: "SUCCESS",
      details: { test: true },
    });

    const logs = await auditService.getRecentLogs(userA.userId, 5);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].toolName).toBe("test_tool");
    expect(logs[0].status).toBe("SUCCESS");
  });

  it("10. Retrieves database stats from Neon", async () => {
    const stats = await statsService.getStats(userA.userId);
    expect(stats.userStats.userId).toBe(userA.userId);
    expect(stats.userStats.totalUserRecords).toBeGreaterThanOrEqual(1);
    expect(stats.systemStats.totalRecords).toBeGreaterThanOrEqual(1);
    expect(stats.databaseHealth.healthy).toBe(true);
  });

  it("11. Retrieves system status", async () => {
    const status = await systemService.getStatus();
    expect(status.status).toBe("OK");
    expect(status.database.status).toBe("CONNECTED");
    expect(status.transport).toBe("streamable-http");
  });

  it("12. Deletes the record for authorized owner", async () => {
    const result = await recordService.deleteRecord({
      userId: userA.userId,
      recordId: createdRecordId,
    });

    expect(result.success).toBe(true);
    expect(result.deletedRecordId).toBe(createdRecordId);

    // Verify record is gone
    await expect(
      recordService.getRecord({
        userId: userA.userId,
        recordId: createdRecordId,
      })
    ).rejects.toThrow("was not found");
  });

  afterAll(async () => {
    try {
      const db = getDbClient();
      // 1. Delete audit logs for test users or test tool
      await db
        .delete(auditLogs)
        .where(
          or(
            inArray(auditLogs.userId, [userA.userId, userB.userId]),
            eq(auditLogs.toolName, "test_tool")
          )
        );

      // 2. Delete test records
      await db
        .delete(records)
        .where(inArray(records.userId, [userA.userId, userB.userId]));

      // 3. Delete test users
      await db
        .delete(users)
        .where(inArray(users.id, [userA.userId, userB.userId]));
    } catch (cleanupErr) {
      console.warn("Cleanup warning in neonIntegration.test.ts:", cleanupErr);
    }
  });
});

