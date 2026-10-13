"use client";
import type { PhotoViewerPhoto } from "@/lib/photoViewer";
import { ProfileAvatar } from "./ProfileAvatar";
export default function PartyAvatar({ url, name, decorative = false, preview = false, gallery, photoId }: { url: string; name: string; decorative?: boolean; preview?: boolean; gallery?: readonly PhotoViewerPhoto[]; photoId?: string }) {
  return <ProfileAvatar gallery={gallery} photoId={photoId} preview={preview} src={url} name={name} size={128} initialsLength={1} decorative={decorative} label={`Foto escolhida por ${name}`} className="size-full object-cover" fallbackClassName="bg-transparent text-inherit" />;
}
