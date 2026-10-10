"use client";

import { useEffect, useState } from "react";
import { ProfileAvatar } from "./ProfileAvatar";

export function ChatAvatar({ name, image, className = "size-8 text-xs", preview = false }: { name: string; image?: string | null; className?: string; preview?: boolean }) {
  return <span role={preview ? undefined : "img"} aria-label={preview ? undefined : `Foto de ${name}`} className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 font-semibold text-primary ${className}`}><ProfileAvatar preview={preview} src={image} name={name} size={48} decorative className="h-full w-full object-cover" fallbackClassName="bg-transparent font-semibold text-primary" /></span>;
}

export function ChatMessageImage({ url, onLoad }: { url: string; onLoad?: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (failed) return <div className="my-2 space-y-2"><p role="status" className="text-xs">Não foi possível carregar a foto.</p><button type="button" onClick={() => setFailed(false)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-current/20 px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar carregar foto</button></div>;
  return <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir foto enviada em tamanho original" className="mb-2 block overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img src={url} alt="Foto enviada na conversa" loading="lazy" onLoad={onLoad} onError={() => setFailed(true)} className="max-h-72 max-w-full object-contain" /></a>;
}
