import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { imageExtension, maximumImageBytes, UploadError } from "./profileImages";
const directory = () => path.resolve(process.cwd(), ".private-uploads", "chat");
export async function saveChatImage(file: File) {
  if (!file.size || file.size > maximumImageBytes) throw new UploadError(413, "Escolha uma imagem de até 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = imageExtension(bytes, file.type);
  const id = randomUUID(), filename = id + extension;
  await fs.mkdir(directory(), { recursive: true });
  const target = path.join(directory(), filename);
  await fs.writeFile(target, bytes, { flag: "wx" });
  return { id, filename, mime: file.type, remove: () => fs.unlink(target) };
}
export async function readChatImage(filename: string): Promise<Buffer> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/.test(filename)) throw new UploadError(404, "Imagem indisponível.");
  const target = path.join(directory(), filename);
  const info = await fs.lstat(target);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximumImageBytes) throw new UploadError(404, "Imagem indisponível.");
  const bytes = await fs.readFile(target);
  if (bytes.length > maximumImageBytes) throw new UploadError(404, "Imagem indisponível.");
  return bytes;
}
