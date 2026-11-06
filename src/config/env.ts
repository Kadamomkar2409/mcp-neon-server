import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .default("3000")
    .transform((val) => {
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid PORT: ${val}`);
      }
      return parsed;
    }),
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required")
    .refine(
      (url) => url.startsWith("postgresql://") || url.startsWith("postgres://"),
      "DATABASE_URL must be a valid PostgreSQL connection string"
    ),
  MCP_TRANSPORT: z
    .enum(["streamable-http", "sse"])
    .default("streamable-http"),
  AUTH_SECRET: z
    .string({ required_error: "AUTH_SECRET is required" })
    .min(16, "AUTH_SECRET must be at least 16 characters long"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | undefined;

export function resetEnvCache(): void {
  validatedEnv = undefined;
}

export function getEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedErrors = result.error.errors.map((err) => {
      return `  - ${err.path.join(".")}: ${err.message}`;
    });
    const message = `Environment configuration validation failed:\n${formattedErrors.join(
      "\n"
    )}`;
    console.error(message);
    throw new Error(message);
  }

  validatedEnv = result.data;
  return validatedEnv;
}

export const env = {
  get current() {
    return getEnv();
  },
};
