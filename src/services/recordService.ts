import {
  getDbClient,
  records,
  users,
  RecordItem,
} from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { and, eq, ilike, or, gte, lte, sql, desc, count } from "drizzle-orm";
import { logger } from "../utils/logger.js";

export interface CreateRecordInput {
  userId: string;
  userEmail: string;
  userName?: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface GetRecordInput {
  userId: string;
  recordId: string;
}

export interface ListRecordsInput {
  userId: string;
  limit?: number;
  offset?: number;
  titleFilter?: string;
  createdAfter?: string; // ISO date
  createdBefore?: string; // ISO date
}

export interface UpdateRecordInput {
  userId: string;
  recordId: string;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface DeleteRecordInput {
  userId: string;
  recordId: string;
}

export interface SearchRecordsInput {
  userId: string;
  query: string;
  limit?: number;
  offset?: number;
}

export class RecordService {
  /**
   * Ensures the user row exists in the PostgreSQL database.
   * If it does not exist, creates it using the authenticated token identity.
   */
  async ensureUserExists(
    userId: string,
    email: string,
    name?: string
  ): Promise<void> {
    const db = getDbClient();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existing.length === 0) {
      // Check if email is already taken by a different user ID
      const emailExists = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (emailExists.length > 0) {
        // Update user ID or reuse
        return;
      }

      await db.insert(users).values({
        id: userId,
        email,
        name: name || email.split("@")[0] || "User",
      });
      logger.info(`Initialized user profile in database: ${email}`, { userId });
    }
  }

  /**
   * Creates a new user record.
   */
  async createRecord(input: CreateRecordInput): Promise<RecordItem> {
    const db = getDbClient();

    // Ensure the foreign key target user exists
    await this.ensureUserExists(input.userId, input.userEmail, input.userName);

    const [newRecord] = await db
      .insert(records)
      .values({
        userId: input.userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        metadata: input.metadata || {},
      })
      .returning();

    logger.info(`Record created successfully: ${newRecord.id}`, {
      userId: input.userId,
      recordId: newRecord.id,
    });

    return newRecord;
  }

  /**
   * Retrieves a single record by ID, enforcing user ownership.
   */
  async getRecord(input: GetRecordInput): Promise<RecordItem> {
    const db = getDbClient();

    const [record] = await db
      .select()
      .from(records)
      .where(eq(records.id, input.recordId))
      .limit(1);

    if (!record) {
      throw new AppError(
        `Record with ID '${input.recordId}' was not found.`,
        404,
        "NOT_FOUND"
      );
    }

    // Strict multi-tenancy ownership check
    if (record.userId !== input.userId) {
      logger.warn(
        `Unauthorized access attempt: user ${input.userId} tried to access record ${input.recordId} owned by ${record.userId}`
      );
      throw new AppError(
        "Forbidden: You do not have permission to access this record.",
        403,
        "FORBIDDEN"
      );
    }

    return record;
  }

  /**
   * Lists records owned by the authenticated user with filtering and pagination.
   */
  async listRecords(input: ListRecordsInput): Promise<{
    records: RecordItem[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const db = getDbClient();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);

    const conditions = [eq(records.userId, input.userId)];

    if (input.titleFilter && input.titleFilter.trim()) {
      conditions.push(ilike(records.title, `%${input.titleFilter.trim()}%`));
    }

    if (input.createdAfter) {
      conditions.push(gte(records.createdAt, new Date(input.createdAfter)));
    }

    if (input.createdBefore) {
      conditions.push(lte(records.createdAt, new Date(input.createdBefore)));
    }

    const whereClause = and(...conditions);

    // Total count query
    const [totalResult] = await db
      .select({ total: count() })
      .from(records)
      .where(whereClause);

    const total = totalResult?.total ?? 0;

    // Data query
    const results = await db
      .select()
      .from(records)
      .where(whereClause)
      .orderBy(desc(records.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      records: results,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + results.length < total,
      },
    };
  }

  /**
   * Updates an existing record, enforcing ownership.
   */
  async updateRecord(input: UpdateRecordInput): Promise<RecordItem> {
    const db = getDbClient();

    // Verify ownership first
    const existing = await this.getRecord({
      userId: input.userId,
      recordId: input.recordId,
    });

    const updatePayload: Partial<typeof records.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) {
      updatePayload.title = input.title.trim();
    }
    if (input.description !== undefined) {
      updatePayload.description = input.description ? input.description.trim() : null;
    }
    if (input.metadata !== undefined) {
      // Merge or overwrite metadata
      updatePayload.metadata = {
        ...existing.metadata,
        ...input.metadata,
      };
    }

    const [updatedRecord] = await db
      .update(records)
      .set(updatePayload)
      .where(
        and(eq(records.id, input.recordId), eq(records.userId, input.userId))
      )
      .returning();

    logger.info(`Record updated: ${input.recordId}`, {
      userId: input.userId,
      recordId: input.recordId,
    });

    return updatedRecord;
  }

  /**
   * Deletes a record, enforcing ownership.
   */
  async deleteRecord(input: DeleteRecordInput): Promise<{
    success: boolean;
    deletedRecordId: string;
    deletedAt: string;
  }> {
    const db = getDbClient();

    // Verify ownership first
    await this.getRecord({
      userId: input.userId,
      recordId: input.recordId,
    });

    await db
      .delete(records)
      .where(
        and(eq(records.id, input.recordId), eq(records.userId, input.userId))
      );

    logger.info(`Record deleted: ${input.recordId}`, {
      userId: input.userId,
      recordId: input.recordId,
    });

    return {
      success: true,
      deletedRecordId: input.recordId,
      deletedAt: new Date().toISOString(),
    };
  }

  /**
   * Searches records matching a query across title and description for the user.
   */
  async searchRecords(input: SearchRecordsInput): Promise<{
    records: RecordItem[];
    query: string;
    totalMatches: number;
    limit: number;
    offset: number;
  }> {
    const db = getDbClient();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);
    const cleanQuery = input.query.trim();

    if (!cleanQuery) {
      throw new AppError("Search query must not be empty.", 400, "BAD_REQUEST");
    }

    const pattern = `%${cleanQuery}%`;

    const whereClause = and(
      eq(records.userId, input.userId),
      or(ilike(records.title, pattern), ilike(records.description, pattern))
    );

    const [totalResult] = await db
      .select({ total: count() })
      .from(records)
      .where(whereClause);

    const totalMatches = totalResult?.total ?? 0;

    const results = await db
      .select()
      .from(records)
      .where(whereClause)
      .orderBy(desc(records.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      records: results,
      query: cleanQuery,
      totalMatches,
      limit,
      offset,
    };
  }
}

export const recordService = new RecordService();

