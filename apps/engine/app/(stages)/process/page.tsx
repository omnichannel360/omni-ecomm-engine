export const dynamic = "force-dynamic";
export default function ProcessPage() {
  return (
    <>
      <h2 className="h">Stage 2 · Process</h2>
      <p className="sub">Claude Sonnet 4.6 reasoning. Opus 4.7 for complex SKUs. Tool-use JSON output.</p>
      <div className="card"><strong>Worker:</strong> <code>services/process-worker</code> · <strong>Queue:</strong> <code>process</code> · <strong>Owns:</strong> <code>ai_outputs</code></div>
      <div className="card">Reasoning logs + prompt tuning UI lands in v1.2. Worker runs headlessly on stage event.</div>
    </>
  );
}
