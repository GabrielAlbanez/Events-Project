import Image from "next/image";
import { cn } from "@/lib/utils";
import styles from "./Landing.module.css";

type ShotProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  priority?: boolean;
  className?: string;
};

type BrowserFrameProps = ShotProps & { address: string; caption?: string };

export const REAL_UI_CAPTION = "Interface real · dados de demonstração";

/** Moldura de navegador em CSS com uma captura real da aplicação. */
export function BrowserFrame({ src, alt, width, height, sizes, priority = false, address, caption, className }: BrowserFrameProps) {
  return (
    <figure className={cn(styles.figure, className)}>
      <div className={styles.browser}>
        <div className={styles.browserBar} aria-hidden="true">
          <span className={styles.dots}><span /><span /><span /></span>
          <span className={styles.url}>{address}</span>
        </div>
        <div className={styles.shot} style={{ aspectRatio: `${width} / ${height}` }}>
          <Image src={src} alt={alt} fill sizes={sizes} priority={priority} loading={priority ? undefined : "lazy"} />
        </div>
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}

/** Moldura de celular em CSS com uma captura real da versão mobile. */
export function PhoneFrame({ src, alt, sizes, priority = false, className }: Omit<ShotProps, "width" | "height">) {
  return (
    <div className={cn(styles.phone, className)}>
      <span className={styles.phoneNotch} aria-hidden="true" />
      <div className={styles.phoneScreen}>
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} loading={priority ? undefined : "lazy"} />
      </div>
    </div>
  );
}
