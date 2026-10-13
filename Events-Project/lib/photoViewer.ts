import { profileMediaUrl } from "./profileMediaUrl";

export interface PhotoViewerPhoto { id: string; src: string; label: string; }
export interface PhotoViewerSelection { id?: string; src: string; label: string; }

/** Use only photos already present in the authorized screen data. */
export function normalizePhotoGallery(items: readonly PhotoViewerPhoto[] | undefined, selected: PhotoViewerSelection): PhotoViewerPhoto[] {
  const photos: PhotoViewerPhoto[] = [];
  const seen = new Set<string>();
  for (const item of items ?? []) {
    const src = profileMediaUrl(item.src);
    const id = item.id || src;
    if (!src || !id || seen.has(id)) continue;
    seen.add(id); photos.push({ id, src, label: item.label });
  }
  const src = profileMediaUrl(selected.src);
  if (src && !photos.some(photo => selected.id ? photo.id === selected.id : photo.src === src)) {
    photos.push({ id: selected.id || src, src, label: selected.label });
  }
  return photos;
}

export function nextPhotoIndex(index: number, delta: number, count: number): number {
  if (count <= 1) return 0;
  return ((index + delta) % count + count) % count;
}
