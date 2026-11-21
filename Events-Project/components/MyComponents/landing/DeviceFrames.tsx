import Image from "next/image";
import { cn } from "@/lib/utils";
import styles from "./Landing.module.css";

type ScreenshotProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  /** "phone" recorta a captura em proporção de celular, com cantos mais arredondados. */
  variant?: "desktop" | "phone";
  caption?: string;
  className?: string;
};

export const REAL_UI_CAPTION = "Interface real · eventos publicados no EventMap";
export const DEMO_DATA_CAPTION = "Interface real · dados de demonstração";

/** Captura real da aplicação numa moldura discreta (borda fina e sombra suave). */
export function Screenshot({ src, alt, width, height, sizes, variant = "desktop", caption = REAL_UI_CAPTION, className }: ScreenshotProps) {
  const phone = variant === "phone";
  return (
    <figure className={cn(styles.figure, phone && styles.figurePhone, className)}>
      <div className={cn(styles.frame, phone && styles.framePhone)} style={{ aspectRatio: `${width} / ${height}` }}>
        <Image src={src} alt={alt} fill sizes={sizes} loading="lazy" className={styles.frameImage} />
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
