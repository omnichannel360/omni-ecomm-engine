import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Omni Ecomm Engine",
  description: "10-stage e-commerce content engine — OmniChannel"
};

const stages = [
  ["/dashboard", "Dashboard"],
  ["/ingest", "1. Ingest"],
  ["/process", "2. Process"],
  ["/generate", "3. Generate"],
  ["/audit", "4. Audit"],
  ["/queue", "5. Queue"],
  ["/review", "6. Review"],
  ["/notify", "7. Notify"],
  ["/export", "8. Export"],
  ["/settings", "Settings"]
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="nav">
            <h1>Omni Ecomm</h1>
            {stages.map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
            <div style={{ marginTop: 18, fontSize: 11, color: "var(--muted)" }}>v1.1 · Hetzner</div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
