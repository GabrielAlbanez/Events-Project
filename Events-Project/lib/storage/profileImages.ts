import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export class UploadError extends Error { constructor(public status: number, message: string) { super(message); } }
export const maximumImageBytes = 5 * 1024 * 1024;
export const maximumMultipartBytes = 6 * 1024 * 1024;
export function imageExtension(bytes: Buffer, mime: string): string {
  const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString("ascii", 12, 16) === "IHDR";
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const avif = bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].some(brand => bytes.subarray(8, Math.min(bytes.readUInt32BE(0), bytes.length, 128)).includes(Buffer.from(brand)));
  if (mime === "image/png" && png) return ".png";
  if (mime === "image/jpeg" && jpeg) return ".jpg";
  if (mime === "image/webp" && webp) return ".webp";
  if (mime === "image/avif" && avif) return ".avif";
  throw new UploadError(415, "Use uma imagem JPG, PNG, WebP ou AVIF válida.");
}
export async function boundedMultipart(request: Request): Promise<FormData> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data;")) throw new UploadError(400, "Envie o arquivo como multipart/form-data.");
  if (Number(request.headers.get("content-length") ?? 0) > maximumMultipartBytes) throw new UploadError(413, "Arquivo muito grande.");
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError(400, "Nenhum arquivo enviado.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength;
      if (size > maximumMultipartBytes) { await reader.cancel(); throw new UploadError(413, "Arquivo muito grande."); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks, size), { headers: { "Content-Type": type } }).formData(); }
  catch { throw new UploadError(400, "Arquivo inválido."); }
}
export async function saveProfileImage(file: File): Promise<{ url: string; remove: () => Promise<void> }> {
  if (!file.size) throw new UploadError(400, "Selecione uma imagem não vazia.");
  if (file.size > maximumImageBytes) throw new UploadError(413, "Use imagens de até 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = imageExtension(bytes, file.type);
  const directory = path.resolve(process.cwd(), "public/uploads");
  await fs.mkdir(directory, { recursive: true });
  const name = randomUUID() + extension; const target = path.join(directory, name);
  await fs.writeFile(target, bytes, { flag: "wx" });
  return { url: `/uploads/${name}`, remove: async () => { await fs.unlink(target); } };
}
