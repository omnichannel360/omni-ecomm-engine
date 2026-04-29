import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGES_DIR = process.env.IMAGES_DIR || "/data/images";

export async function GET(_req: Request, { params }: { params: Promise<{ sku_id: string; slot: string }> }) {
  const { sku_id, slot } = await params;
  if (!/^[0-9a-f-]{36}$/.test(sku_id) || !/^[a-z0-9_]+$/.test(slot)) return new NextResponse("bad params", { status: 400 });
  try {
    const buf = await readFile(join(IMAGES_DIR, sku_id, `${slot}.png`));
    return new NextResponse(buf, { headers: { "content-type": "image/png", "cache-control": "private, max-age=60" } });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
