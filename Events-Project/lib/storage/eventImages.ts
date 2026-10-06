import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export async function saveEventImage(file: File) {
    const extensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
    const extension = extensions[file.type];
    if (!extension || file.size > 5 * 1024 * 1024)
        throw new Error("Use imagens JPG, PNG ou WebP de até 5 MB.");
    const directory = path.join(process.cwd(), "public/uploads");
    await fs.mkdir(directory, { recursive: true });
    const name = randomUUID() + extension;
    await fs.writeFile(path.join(directory, name), Buffer.from(await file.arrayBuffer()));
    return "/uploads/" + name;
}
export async function removeEventImages(urls: readonly string[]): Promise<void> {
    for (const url of urls) {
        await fs.unlink(path.join(process.cwd(), "public", url)).catch(() => undefined);
    }
}
