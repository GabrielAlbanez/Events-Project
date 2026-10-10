"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { profileMediaUrl, profileImageIsOptimized } from "@/lib/profileMediaUrl";

type ProfileAvatarProps = {
  src?: string | null;
  name?: string | null;
  className?: string;
  size: number;
  decorative?: boolean;
  label?: string;
  fallbackClassName?: string;
  initialsLength?: number;
};

export function ProfileAvatar(props: ProfileAvatarProps) {
  return <ProfileAvatarImage key={props.src || "empty"} {...props} />;
}

function ProfileAvatarImage({ src: originalSource, name, className, size, decorative = false, label: customLabel, fallbackClassName, initialsLength = 2 }: ProfileAvatarProps) {
  const src = profileMediaUrl(originalSource);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const label = customLabel || `Foto de perfil de ${name || "usuário"}`;
  const initials = (name?.trim().split(/\s+/).filter(Boolean).slice(0, initialsLength).map((part) => part[0]).join("") || "U").toUpperCase();

  if (!src || failedSource === src) {
    return <span role={decorative ? undefined : "img"} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined} className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden", fallbackClassName ?? "bg-muted font-semibold text-muted-foreground", className)}><span aria-hidden="true">{initials}</span></span>;
  }

  return <Image src={src} alt={decorative ? "" : label} aria-hidden={decorative || undefined} width={size} height={size} referrerPolicy="no-referrer" unoptimized={!profileImageIsOptimized(src)} className={className} onError={() => setFailedSource(src)} />;
}
