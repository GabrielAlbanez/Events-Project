import Image from "next/image";
import Link from "next/link";
import { ArrowDown, CalendarHeart, MapPin, Users } from "lucide-react";
import { BrandLogo } from "@/components/MyComponents/BrandLogo";
import styles from "./LoginPage.module.css";

// Product capabilities, not figures: the login never shows invented counts.
const VALUE_CHIPS = [
  { Icon: MapPin, title: "Eventos", text: "perto de você" },
  { Icon: Users, title: "Pessoas", text: "para conhecer" },
  { Icon: CalendarHeart, title: "Agenda", text: "dos seus favoritos" },
];

export function LoginPagePresentation({ mode = "login" }: { mode?: "login" | "register" }) {
  const headingId = mode === "register" ? "register-introduction" : "login-introduction";
  return (
    <section aria-labelledby={headingId} className={styles.presentation}>
      {/* Responsive cut toward the form: a diagonal that softens into a curve near the bottom. */}
      <svg className={styles.clipDefs} aria-hidden="true" focusable="false">
        <clipPath id="login-photo-cut" clipPathUnits="objectBoundingBox">
          <path d="M0 0H.985L.77 .7C.735 .79 .69 .855 .62 .91C.56 .955 .51 .98 .46 1H0Z" />
        </clipPath>
        <clipPath id="login-photo-cut-mobile" clipPathUnits="objectBoundingBox">
          <path d="M0 0H1V.92C.78 .99 .55 1 .3 .98C.18 .97 .08 .96 0 .965Z" />
        </clipPath>
      </svg>
      <div className={styles.photoFrame}>
        <Image src="/branding/login-night-v2.webp" alt="" fill sizes="(min-width: 1024px) 62vw, 100vw" priority className={styles.photo} />
        <div className={styles.photoScrim} aria-hidden="true" />
        <span className={styles.blobOutline} aria-hidden="true" />
        <span className={styles.blobFill} aria-hidden="true" />
      </div>
      <div className={styles.presentationInner}>
        <Link href="/" className={styles.brandLink} aria-label="EventMap — página inicial">
          <BrandLogo priority className={styles.brandLogo} />
        </Link>
        <div className={styles.photoCopy}>
          <h2 id={headingId}>
            {mode === "register" ? <>Seu próximo momento começa por </> : <>Encontre<br /> seu próximo<br /> </>}
            <span className={styles.headlineAccent}>
              {mode === "register" ? "aqui." : "momento."}
              <svg viewBox="0 0 140 14" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M3 9C34 4 70 3 137 6M10 12c30-3 62-4 104-3" /></svg>
            </span>
          </h2>
          <p className={styles.photoDescription}>{mode === "register" ? "Encontre eventos que combinam com você e pessoas para compartilhar a experiência." : "Eventos por perto, pessoas para conhecer e experiências para viver."}</p>
          <ul className={styles.valueChips} aria-label="O que você encontra no EventMap">
            {VALUE_CHIPS.map(({ Icon, title, text }) => (
              <li key={title} className={styles.valueChip}>
                <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
                <span><strong>{title}</strong><span>{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <Link href="/conheca" className={styles.discoverLink}>
          Descubra o EventMap
          <span className={styles.discoverIcon} aria-hidden="true"><ArrowDown size={18} /></span>
        </Link>
      </div>
    </section>
  );
}
