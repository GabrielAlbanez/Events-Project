import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { imageExtension } from "./profileImages";
export async function saveEventImage(file: File) {
    const extensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
    const extension = extensions[file.type];
    if (!extension || file.size > 5 * 1024 * 1024)
        throw new Error("Use imagens JPG, PNG ou WebP de até 5 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    imageExtension(bytes, file.type);
    const name = randomUUID() + extension;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
        const { storeMedia } = await import("./blobMedia");
        await storeMedia("uploads/" + name, bytes, file.type);
        return "/uploads/" + name;
    }
    const directory = path.join(process.cwd(), "public/uploads");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, name), bytes);
    return "/uploads/" + name;
}
export async function removeEventImages(urls: readonly string[]): Promise<void> {
    for (const url of urls) {
        if (!/^\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(url)) continue;
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            const { del } = await import("@vercel/blob");
            await del(url.slice(1)).catch(() => undefined);
        }
        await fs.unlink(path.join(process.cwd(), "public", url)).catch(() => undefined);
    }
}
