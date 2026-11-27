import type { ReactNode } from "react";
import { LoginPagePresentation } from "@/components/MyComponents/LoginPagePresentation";
import { cn } from "@/lib/utils";
import styles from "./LoginPage.module.css";

export function LoginPageShell({ children, className, mode = "login" }: { children: ReactNode; className?: string; mode?: "login" | "register" }) {
  return (
    <div className={cn(styles.page, mode === "register" && styles.registerPage, className)}>
      <div className={styles.layout}>
        <LoginPagePresentation mode={mode} />
        <span className={styles.limeCurve} aria-hidden="true">
          <svg viewBox="0 0 220 160" preserveAspectRatio="none" focusable="false"><path d="M2 0C18 70 70 150 218 132" /></svg>
        </span>
        <section className={styles.formPanel} aria-label={mode === "register" ? "Criar uma conta" : "Entrar na conta"}>
          <span className={cn(styles.panelBlob, styles.panelBlobTop)} aria-hidden="true" />
          <span className={cn(styles.panelBlob, styles.panelBlobBottom)} aria-hidden="true" />
          <span className={cn(styles.panelBlob, styles.panelBlobCorner)} aria-hidden="true" />
          <div className={styles.formCard}>
            <div className={styles.formContent}>{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
