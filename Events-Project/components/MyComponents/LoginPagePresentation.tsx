import Image from "next/image";
import { CalendarDays, MapPin, Sparkles } from "lucide-react";
import styles from "./LoginPage.module.css";

export function LoginPagePresentation({ mode = "login" }: { mode?: "login" | "register" }) {
  const headingId = mode === "register" ? "register-introduction" : "login-introduction";
  return (
    <section aria-labelledby={headingId} className={styles.presentation}>
      <Image src="/branding/login-night-v2.webp" alt="" fill sizes="(min-width: 1024px) 53vw, 1px" priority className={styles.photo} />
      <div className={styles.photoScrim} aria-hidden="true" />
      <div className={styles.photoChips} aria-hidden="true">
        <span className={styles.photoChip}><MapPin size={16} />Descubra por perto</span>
        <span className={styles.photoChip}><CalendarDays size={16} />Sua próxima experiência</span>
      </div>
      <div className={styles.photoCopy}>
        <p className={styles.photoSignature}><Sparkles size={16} aria-hidden="true" />Descubra. Encontre. Viva.</p>
        <h2 id={headingId}>{mode === "register" ? "Seu próximo momento começa por aqui." : "Encontre seu próximo momento."}</h2>
        <p className={styles.photoDescription}>{mode === "register" ? "Encontre eventos que combinam com você e pessoas para compartilhar a experiência." : "Eventos por perto, pessoas para conhecer e experiências para viver."}</p>
      </div>
    </section>
  );
}
