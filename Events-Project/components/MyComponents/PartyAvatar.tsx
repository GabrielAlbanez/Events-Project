"use client";
import { ProfileAvatar } from "./ProfileAvatar";
export default function PartyAvatar({ url, name, decorative = false }: { url: string; name: string; decorative?: boolean }) {
  return <ProfileAvatar src={url} name={name} size={128} initialsLength={1} decorative={decorative} label={`Foto escolhida por ${name}`} className="size-full object-cover" fallbackClassName="bg-transparent text-inherit" />;
}
