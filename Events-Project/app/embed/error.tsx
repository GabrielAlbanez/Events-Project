"use client";

import styles from "./embed.module.css";

/** Falha do widget fica dentro do iframe, sem cair na página de erro com o menu do site. */
export default function EmbedError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={styles.inner}>
      <div role="alert" className={styles.empty}>
        <p style={{ margin: 0 }}>Não foi possível carregar a agenda agora.</p>
        <button type="button" onClick={reset} className={styles.retry}>Tentar novamente</button>
      </div>
    </div>
  );
}
