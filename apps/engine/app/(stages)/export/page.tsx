export const dynamic = "force-dynamic";
export default function ExportPage() {
  return (
    <>
      <h2 className="h">Stage 8 · Export</h2>
      <p className="sub">Canva Bulk Create CSV + Amazon A+ Content + ZIP packager.</p>
      <div className="card"><strong>Worker:</strong> <code>services/export-worker</code> · <strong>Queue:</strong> <code>export</code> · <strong>Owns:</strong> <code>exports</code></div>
    </>
  );
}
