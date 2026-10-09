"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { profileMediaUrl } from "@/lib/profileMediaUrl";

type ProfileAvatarProps = {
  src?: string | null;
  name?: string | null;
  className?: string;
  size: number;
};

export function ProfileAvatar(props: ProfileAvatarProps) {
  return <ProfileAvatarImage key={props.src || "empty"} {...props} />;
}

function ProfileAvatarImage({ src: originalSource, name, className, size }: ProfileAvatarProps) {
  const src = profileMediaUrl(originalSource);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const label = `Foto de perfil de ${name || "usuário"}`;
  const initials = (name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "U").toUpperCase();
  const isOptimizedSource = Boolean(src && (src.startsWith("/") || /^https:\/\/(lh3\.googleusercontent\.com|cdnb\.artstation\.com|pbs\.twimg\.com)\//.test(src)));

  if (!src || failedSource === src) {
    return <span role="img" aria-label={label} className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted font-semibold text-muted-foreground", className)}><span aria-hidden="true">{initials}</span></span>;
  }

  return <Image key={src} src={src} alt={label} width={size} height={size} referrerPolicy="no-referrer" unoptimized={!isOptimizedSource} className={className} onError={() => setFailedSource(src)} />;
}
