import { describe, it, expect } from "vitest";
import {
  formatSafeErrorMessage,
  AppError,
} from "../../src/middleware/errorHandler.js";

describe("Safe Error Handler", () => {
  it("formats AppError messages accurately", () => {
    const appErr = new AppError("Item not found", 404, "NOT_FOUND");
    expect(formatSafeErrorMessage(appErr)).toBe("Item not found");
  });

  it("safely sanitizes foreign key violations", () => {
    const dbErr = new Error(
      'insert or update on table "records" violates foreign key constraint "records_user_id_users_id_fk"'
    );
    expect(formatSafeErrorMessage(dbErr)).toBe(
      "Operation failed: Referenced user or resource does not exist."
    );
  });

  it("safely sanitizes unique constraint violations", () => {
    const dbErr = new Error(
      'duplicate key value violates unique constraint "users_email_unique"'
    );
    expect(formatSafeErrorMessage(dbErr)).toBe(
      "Operation failed: A record with this unique attribute already exists."
    );
  });

  it("safely sanitizes timeout errors", () => {
    const dbErr = new Error("Query timed out after 5000ms");
    expect(formatSafeErrorMessage(dbErr)).toBe(
      "Database operation timed out. Please try again later."
    );
  });
});

