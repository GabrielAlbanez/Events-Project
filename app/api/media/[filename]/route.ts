import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { maximumImageBytes } from "@/lib/storage/profileImages";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const mime: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };
export async function GET(_request: Request, { params }: { params: { filename: string } }) {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|avif)$/.exec(params.filename);
  if (!match) return new NextResponse(null, { status: 404 });
  const target = path.join(process.cwd(), "public", "uploads", params.filename);
  try {
    const info = await fs.lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || info.size > maximumImageBytes) return new NextResponse(null, { status: 404 });
    const image = await fs.readFile(target);
    if (image.length > maximumImageBytes) return new NextResponse(null, { status: 404 });
    return new NextResponse(image, { headers: { "Content-Type": mime[match[2]], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
