export const dynamic = "force-dynamic";
export default function AuditPage() {
  return (
    <>
      <h2 className="h">Stage 4 · Audit</h2>
      <p className="sub">Claude Opus 4.7 Vision + perceptual hash + brand-rule engine.</p>
      <div className="card"><strong>Worker:</strong> <code>services/audit-worker</code> · <strong>Queue:</strong> <code>audit</code> · <strong>Owns:</strong> <code>audit_results</code></div>
      <div className="card">Checks: perceptual hash dup, brand color presence, safe-zone, vision QA, NSFW.</div>
    </>
  );
}
