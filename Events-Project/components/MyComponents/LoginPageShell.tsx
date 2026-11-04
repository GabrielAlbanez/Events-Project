import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginPagePresentation } from "@/components/MyComponents/LoginPagePresentation";
import { cn } from "@/lib/utils";
import styles from "./LoginPage.module.css";

export function LoginPageShell({ children, className, mode = "login" }: { children: ReactNode; className?: string; mode?: "login" | "register" }) {
  return (
    <div className={cn(styles.page, mode === "register" && styles.registerPage, className)}>
      <div className={styles.backRow}><Link href="/" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" /><span>Voltar para explorar</span></Link></div>
      <main className={styles.layout}>
        <LoginPagePresentation mode={mode} />
        <section className={styles.formPanel} aria-label={mode === "register" ? "Criar uma conta" : "Entrar na conta"}>
          <div className={styles.formContent}>{children}</div>
          <p className={styles.footnote}>{mode === "register" ? "Crie sua conta e encontre novas experiências para viver." : "Seus eventos, suas conexões e sua agenda em um só lugar."}</p>
        </section>
      </main>
    </div>
  );
}
