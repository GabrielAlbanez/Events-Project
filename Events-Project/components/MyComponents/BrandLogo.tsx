import Image from "next/image";
import { cn } from "@/lib/utils";
import styles from "./BrandLogo.module.css";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2.5 text-foreground", className)} role="img" aria-label="EventMap">
      <span className={cn(styles.frame, "relative block size-8 shrink-0 overflow-hidden rounded-lg sm:size-9")}>
        <Image
          src="/branding/eventmap-premium-logo.svg"
          alt=""
          width={48}
          height={48}
          sizes="36px"
          priority={priority}
          className={styles.image}
        />
      </span>
      <span className={cn(styles.wordmark, "whitespace-nowrap text-sm sm:text-base")} aria-hidden="true">
        Event<span className={styles.wordmarkAccent}>Map</span>
      </span>
    </span>
  );
}
