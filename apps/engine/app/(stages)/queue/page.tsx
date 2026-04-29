import IORedis from "ioredis";

export const dynamic = "force-dynamic";

async function depths() {
  const out: Record<string, { wait: number; active: number; failed: number; completed: number }> = {};
  const queues = ["scrape", "process", "generate", "audit", "notify", "export"];
  try {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    const r = new IORedis(url, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 1500 });
    await r.connect();
    for (const n of queues) {
      out[n] = {
        wait: Number(await r.llen(`bull:${n}:wait`)) || 0,
        active: Number(await r.llen(`bull:${n}:active`)) || 0,
        failed: Number(await r.zcard(`bull:${n}:failed`)) || 0,
        completed: Number(await r.zcard(`bull:${n}:completed`)) || 0
      };
    }
    r.disconnect();
  } catch {
    for (const n of queues) out[n] = { wait: 0, active: 0, failed: 0, completed: 0 };
  }
  return out;
}

export default async function QueuePage() {
  const d = await depths();
  return (
    <>
      <h2 className="h">Stage 5 · Queue</h2>
      <p className="sub">BullMQ queue depths from Redis. Bull Board admin lands in v1.2.</p>
      <div className="card">
        <table>
          <thead><tr><th>Queue</th><th>Wait</th><th>Active</th><th>Completed</th><th>Failed</th></tr></thead>
          <tbody>{Object.entries(d).map(([n, v]) => (<tr key={n}><td><code>{n}</code></td><td>{v.wait}</td><td>{v.active}</td><td>{v.completed}</td><td><span className={`tag ${v.failed > 0 ? "bad" : ""}`}>{v.failed}</span></td></tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
