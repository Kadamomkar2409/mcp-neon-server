/**
 * Safe Logger implementation that sanitizes logs to prevent sensitive information
 * (passwords, tokens, database URLs, auth secrets) from ever leaking into console or log streams.
 */

const SENSITIVE_PATTERNS = [
  /bearer\s+[a-zA-Z0-9._~+/-]+=*/gi,
  /postgres(ql)?:\/\/[^@\s]+:[^@\s]+@[^\s]+/gi,
  /"(token|secret|password|authorization|auth_secret|database_url)":\s*"[^"]+"/gi,
  /(token|secret|password|authorization|auth_secret|database_url)=([^\s&]+)/gi,
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, // JWT pattern
];

function sanitize(message: string): string {
  let cleaned = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[REDACTED]");
  }
  return cleaned;
}

function formatArg(arg: unknown): unknown {
  if (typeof arg === "string") {
    return sanitize(arg);
  }
  if (arg instanceof Error) {
    return {
      message: sanitize(arg.message),
      name: arg.name,
      stack: arg.stack ? sanitize(arg.stack) : undefined,
    };
  }
  if (typeof arg === "object" && arg !== null) {
    try {
      const json = JSON.stringify(arg, (key, value) => {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("password") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("token") ||
          lowerKey.includes("authorization") ||
          lowerKey.includes("database_url")
        ) {
          return "[REDACTED]";
        }
        if (typeof value === "string") {
          return sanitize(value);
        }
        return value;
      });
      return JSON.parse(json);
    } catch {
      return "[Unserializable Object]";
    }
  }
  return arg;
}

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class SafeLogger {
  private currentLevel: LogLevel = "info";

  setLevel(level: LogLevel) {
    if (level in LOG_LEVELS) {
      this.currentLevel = level;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.currentLevel];
  }

  private log(level: LogLevel, message: string, ...args: unknown[]) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const sanitizedMsg = sanitize(message);
    const sanitizedArgs = args.map(formatArg);

    const logObject = {
      timestamp,
      level: level.toUpperCase(),
      message: sanitizedMsg,
      ...(sanitizedArgs.length > 0 ? { details: sanitizedArgs } : {}),
    };

    const output = JSON.stringify(logObject);
    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, ...args: unknown[]) {
    this.log("debug", message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.log("info", message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.log("warn", message, ...args);
  }

  error(message: string, ...args: unknown[]) {
    this.log("error", message, ...args);
  }
}

export const logger = new SafeLogger();

