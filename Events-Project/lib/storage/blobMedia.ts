import { del, get, put } from "@vercel/blob";

export async function storeMedia(key: string, bytes: Buffer, contentType: string) {
  const blob = await put(key, bytes, { access: "private", contentType });
  return { remove: async () => { await del(blob.url); } };
}

export async function readMedia(key: string, maximumBytes: number): Promise<Buffer | null> {
  const blob = await get(key, { access: "private" });
  if (!blob || blob.statusCode !== 200) return null;
  if (blob.blob.size < 1 || blob.blob.size > maximumBytes) {
    await blob.stream.cancel();
    return null;
  }
  return Buffer.from(await new Response(blob.stream).arrayBuffer());
}
