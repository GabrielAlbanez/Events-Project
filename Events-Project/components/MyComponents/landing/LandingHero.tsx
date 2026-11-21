import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import ProductDemo from "./ProductDemo";
import styles from "./Landing.module.css";

export function LandingHero() {
  return (
    <>
      <section className={styles.hero} aria-labelledby="conheca-titulo">
        <div className={cn(styles.container, styles.heroInner)}>
          <p className={styles.eyebrow}>Como funciona</p>
          <h1 id="conheca-titulo" className={styles.h1}>
            Descubra o que acontece perto de você
            <span className={styles.h1Soft}> — e viva cada evento por inteiro.</span>
          </h1>
          <p className={styles.lead}>
            O EventMap mostra no mapa os eventos da sua cidade. Da descoberta ao check-in, tudo acontece no mesmo lugar.
          </p>
          <div className={styles.actions}>
            <Link href="/" className={cn(styles.btn, styles.btnPrimary)}>
              Explorar eventos
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a href="#demo" className={cn(styles.btn, styles.btnGhost)}>Ver demonstração</a>
          </div>
        </div>
      </section>

      <section id="demo" className={styles.demo} aria-label="Demonstração interativa do EventMap">
        <div className={styles.container}>
          <ProductDemo />
        </div>
      </section>
    </>
  );
}
