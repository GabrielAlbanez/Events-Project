import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "./embed.module.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Layout mínimo dos widgets. O layout raiz ainda envolve a rota, mas o
 * ClientProviders não renderiza cabeçalho, menu nem rodapé em /embed/**.
 */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return <div className={styles.frame} data-embed-root="">{children}</div>;
}
