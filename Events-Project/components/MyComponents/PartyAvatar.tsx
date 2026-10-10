"use client";
import { ProfileAvatar } from "./ProfileAvatar";
export default function PartyAvatar({ url, name, decorative = false, preview = false }: { url: string; name: string; decorative?: boolean; preview?: boolean }) {
  return <ProfileAvatar preview={preview} src={url} name={name} size={128} initialsLength={1} decorative={decorative} label={`Foto escolhida por ${name}`} className="size-full object-cover" fallbackClassName="bg-transparent text-inherit" />;
}
