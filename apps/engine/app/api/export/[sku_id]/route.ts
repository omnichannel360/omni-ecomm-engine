import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_DIR = process.env.EXPORT_DIR || "/data/exports";

export async function GET(req: Request, { params }: { params: Promise<{ sku_id: string }> }) {
  const { sku_id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(sku_id)) return new NextResponse("bad sku_id", { status: 400 });
  const url = new URL(req.url);
  const fmt = url.searchParams.get("format") === "csv" ? "csv" : "zip";
  const path = join(EXPORT_DIR, `${sku_id}.${fmt}`);
  try {
    await stat(path);
    const buf = await readFile(path);
    return new NextResponse(buf, {
      headers: {
        "content-type": fmt === "zip" ? "application/zip" : "text/csv",
        "content-disposition": `attachment; filename="${sku_id}.${fmt}"`
      }
    });
  } catch {
    return new NextResponse("not exported yet", { status: 404 });
  }
}
