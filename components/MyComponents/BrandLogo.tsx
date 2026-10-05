import Image from "next/image";
import { cn } from "@/lib/utils";
import styles from "./BrandLogo.module.css";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2 text-foreground", className)} role="img" aria-label="EventMap">
      <span className={cn(styles.frame, "relative block size-7 shrink-0 overflow-hidden rounded-lg sm:size-8")}>
        <Image
          src="/branding/eventmap-community-logo.png"
          alt=""
          width={1254}
          height={1254}
          sizes="32px"
          priority={priority}
          className={styles.image}
        />
      </span>
      <span className="whitespace-nowrap text-sm font-semibold tracking-tight sm:text-base" aria-hidden="true">EventMap</span>
    </span>
  );
}
