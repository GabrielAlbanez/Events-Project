/** Client-side preparation of a poster for the AI actions (server limit: JPG/PNG/WebP up to 4 MB). */

export const aiImageAccept = "image/jpeg,image/png,image/webp";
const aiImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Keeps room for the text and multipart overhead under the server action limit. */
export const aiImageTargetBytes = 3.5 * 1024 * 1024;
const maxSide = 2000;

export type PreparedAiImage = { ok: true; file: File } | { ok: false; error: string };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    image.src = url;
  });
}

/** Returns the file as is when small enough; otherwise resizes it to a JPEG under ~3.5 MB. */
export async function prepareAiImage(file: File): Promise<PreparedAiImage> {
  if (!aiImageTypes.has(file.type)) return { ok: false, error: "Use uma imagem JPG, PNG ou WebP." };
  if (file.size <= aiImageTargetBytes) return { ok: true, file };
  try {
    const image = await loadImage(file);
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.74, 0.6]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size > 0 && blob.size <= aiImageTargetBytes) {
        const name = file.name.replace(/\.[^.]+$/, "") || "cartaz";
        return { ok: true, file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }) };
      }
    }
  } catch { /* falls through to the message below */ }
  return { ok: false, error: "Não foi possível reduzir esta imagem. Escolha um arquivo de até 3,5 MB." };
}
