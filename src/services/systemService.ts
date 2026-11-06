import os from "node:os";
import { checkDatabaseHealth } from "../db/index.js";
import { getEnv } from "../config/env.js";

export interface SystemStatus {
  status: "OK" | "DEGRADED" | "DOWN";
  version: string;
  environment: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  transport: string;
  database: {
    status: "CONNECTED" | "UNREACHABLE";
    latencyMs: number;
    error?: string;
  };
  resources: {
    nodeVersion: string;
    platform: string;
    arch: string;
    memoryUsageMb: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    systemLoadAverage: number[];
  };
  timestamp: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

export class SystemService {
  async getStatus(): Promise<SystemStatus> {
    const env = getEnv();
    const uptimeSec = Math.floor(process.uptime());
    const mem = process.memoryUsage();
    const dbHealth = await checkDatabaseHealth(3000);

    const overallStatus: "OK" | "DEGRADED" | "DOWN" = dbHealth.healthy
      ? "OK"
      : "DEGRADED";

    return {
      status: overallStatus,
      version: "1.0.0",
      environment: env.NODE_ENV,
      uptimeSeconds: uptimeSec,
      uptimeFormatted: formatUptime(uptimeSec),
      transport: env.MCP_TRANSPORT,
      database: {
        status: dbHealth.healthy ? "CONNECTED" : "UNREACHABLE",
        latencyMs: dbHealth.latencyMs,
        error: dbHealth.error,
      },
      resources: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryUsageMb: {
          rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
          heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
          heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
          external: Math.round((mem.external / 1024 / 1024) * 100) / 100,
        },
        systemLoadAverage: os.loadavg(),
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const systemService = new SystemService();

