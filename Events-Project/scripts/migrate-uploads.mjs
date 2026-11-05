import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get, put } from "@vercel/blob";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
if (apply && args.includes("--dry-run")) throw new Error("Escolha --dry-run ou --apply.");
if (apply && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Configure BLOB_READ_WRITE_TOKEN.");

const publicName = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{13}-uploaded_image)\.(jpg|png|webp|avif)$/;
const mime = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };
const summary = { eligible: 0, uploaded: 0, existing: 0, skipped: 0 };
const directories = [
  [args.find(arg => arg.startsWith("--uploads="))?.slice(10) ?? "public/uploads", "uploads"],
  [args.find(arg => arg.startsWith("--chat="))?.slice(7) ?? ".private-uploads/chat", "private/chat"],
];

try {
  for (const [directory, prefix] of directories) {
    const entries = await readdir(directory).catch(error => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const filename of entries) {
      const match = publicName.exec(filename);
      if (!match || (prefix === "private/chat" && filename.includes("-uploaded_image"))) { summary.skipped++; continue; }
      const file = resolve(directory, filename);
      const stats = await lstat(file);
      if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > 5 * 1024 * 1024) { summary.skipped++; continue; }
      summary.eligible++;
      if (!apply) continue;
      const key = prefix + "/" + filename;
      const bytes = await readFile(file);
      const existing = await get(key, { access: "private" });
      if (existing?.statusCode === 200) {
        if (existing.blob.size !== bytes.length) {
          await existing.stream.cancel();
          throw new Error("Objeto existente difere do original.");
        }
        if (!bytes.equals(Buffer.from(await new Response(existing.stream).arrayBuffer()))) {
          throw new Error("Objeto existente difere do original.");
        }
        summary.existing++;
        continue;
      }
      await put(key, bytes, { access: "private", contentType: mime[match[1]], allowOverwrite: false });
      summary.uploaded++;
    }
  }
  // A URL armazenada continua apontando para a rota original, agora com leitura do Blob.
  console.log({ mode: apply ? "apply" : "dry-run", ...summary });
} catch (error) {
  console.error("Migração interrompida:", error instanceof Error ? error.name : "erro desconhecido", summary);
  process.exitCode = 1;
}
