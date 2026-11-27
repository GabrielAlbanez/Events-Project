import { maximumUploadImageBytes } from "@/lib/uploadLimits";

/** Square crop used for profile photos: pure geometry, shared by the crop UI and its tests. */
export const cropZoomMin = 1;
export const cropZoomMax = 4;
export const cropOutputMax = 1024;
export const cropOutputMin = 320;

export type CropState = { zoom: number; offsetX: number; offsetY: number };
export type SourceRect = { sx: number; sy: number; size: number };

export function clampZoom(zoom: number): number {
  return Math.min(cropZoomMax, Math.max(cropZoomMin, Number.isFinite(zoom) ? zoom : cropZoomMin));
}

/** Scale that makes the image cover the square viewport at the given zoom. */
export function cropScale(width: number, height: number, viewport: number, zoom: number): number {
  return (viewport / Math.min(width, height)) * clampZoom(zoom);
}

/** Keep the image covering the whole circle: offsets are the image center's shift from the viewport center (display px). */
export function clampCrop(width: number, height: number, viewport: number, state: CropState): CropState {
  const zoom = clampZoom(state.zoom);
  const scale = cropScale(width, height, viewport, zoom);
  const limitX = Math.max(0, (width * scale - viewport) / 2);
  const limitY = Math.max(0, (height * scale - viewport) / 2);
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, Number.isFinite(value) ? value : 0));
  return { zoom, offsetX: clamp(state.offsetX, limitX), offsetY: clamp(state.offsetY, limitY) };
}

/** Square region of the original image that is visible in the viewport. */
export function cropSourceRect(width: number, height: number, viewport: number, state: CropState): SourceRect {
  const crop = clampCrop(width, height, viewport, state);
  const scale = cropScale(width, height, viewport, crop.zoom);
  const size = Math.min(width, height, viewport / scale);
  const sx = Math.min(width - size, Math.max(0, width / 2 - crop.offsetX / scale - size / 2));
  const sy = Math.min(height - size, Math.max(0, height / 2 - crop.offsetY / scale - size / 2));
  return { sx, sy, size };
}

/** Output side in px: never larger than the source crop allows, capped for upload size. */
export function cropOutputSize(sourceSize: number): number {
  return Math.round(Math.min(cropOutputMax, Math.max(cropOutputMin, sourceSize)));
}

type CanvasSource = CanvasImageSource & { width: number; height: number };

/** Draw the crop into a square canvas and encode a JPEG within the upload limit. */
export async function renderCroppedPhoto(source: CanvasSource, rect: SourceRect, createCanvas: (size: number) => HTMLCanvasElement = size => Object.assign(document.createElement("canvas"), { width: size, height: size })): Promise<File> {
  const size = cropOutputSize(rect.size);
  const canvas = createCanvas(size);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, rect.sx, rect.sy, rect.size, rect.size, 0, 0, size, size);
  for (const quality of [0.9, 0.78, 0.62]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size > 0 && blob.size <= maximumUploadImageBytes) return new File([blob], "foto-perfil.jpg", { type: "image/jpeg" });
  }
  throw new Error("Imagem recortada grande demais");
}
