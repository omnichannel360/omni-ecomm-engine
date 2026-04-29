import { supa } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let rows: Array<{ key: string; value: unknown }> = [];
  try {
    const db = supa();
    const { data } = await db.from("settings").select("key, value").order("key");
    if (data) rows = data as typeof rows;
  } catch {}
  return (
    <>
      <h2 className="h">Settings</h2>
      <p className="sub">Prompt templates, brand memory, API keys (rotated via host <code>.env</code>).</p>
      <div className="card">
        <h3 style={{ margin: "0 0 12px" }}>Live settings</h3>
        {rows.length === 0 ? <p style={{ color: "var(--muted)" }}>No settings yet.</p> : (
          <table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>{rows.map((r) => (<tr key={r.key}><td><code>{r.key}</code></td><td><code>{JSON.stringify(r.value)}</code></td></tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
