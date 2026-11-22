import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./Landing.module.css";

type ChapterProps = {
  id: string;
  index: number;
  label: string;
  title: string;
  lead: string;
  tone?: "default" | "muted" | "stage";
  children: ReactNode;
};

/** Capítulo da história: marcador numerado com trilha de rota, título e a experiência interativa. */
export function LandingChapter({ id, index, label, title, lead, tone = "default", children }: ChapterProps) {
  const headingId = `${id}-titulo`;
  return (
    <section id={id} className={cn(styles.chapter, tone === "muted" && styles.chapterMuted, tone === "stage" && styles.chapterStage)} aria-labelledby={headingId}>
      <div className={styles.container}>
        <header className={cn(styles.chapterHead, styles.reveal)}>
          <p className={styles.chapterMark}>
            <span className={styles.chapterNumber} aria-hidden="true">{String(index).padStart(2, "0")}</span>
            <span className={styles.chapterTrail} aria-hidden="true" />
            {label}
          </p>
          <h2 id={headingId} className={styles.h2}>{title}</h2>
          <p className={styles.chapterLead}>{lead}</p>
        </header>
        {children}
      </div>
    </section>
  );
}
