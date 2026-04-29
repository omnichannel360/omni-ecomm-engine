import { Queue } from "bullmq";
import IORedis from "ioredis";

let conn: IORedis | null = null;
const queues: Record<string, Queue> = {};

function redis(): IORedis {
  if (conn) return conn;
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  conn = new IORedis(url, { maxRetriesPerRequest: null });
  return conn;
}

export function q(name: "scrape" | "process" | "generate" | "audit" | "notify" | "export"): Queue {
  if (queues[name]) return queues[name]!;
  queues[name] = new Queue(name, { connection: redis() });
  return queues[name]!;
}
