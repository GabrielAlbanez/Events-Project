"use client";
import { useState } from "react";
export default function PartyAvatar({ url, name, decorative = false }: { url: string; name: string; decorative?: boolean }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? <img src={url} alt={decorative ? "" : `Foto escolhida por ${name}`} loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailed(true)} /> : <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}
