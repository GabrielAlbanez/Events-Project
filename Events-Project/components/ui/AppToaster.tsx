"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { AlertCircle, Bell, CheckCircle2, Info, X } from "lucide-react";
import { cssTransition, ToastContainer } from "react-toastify";
import styles from "./AppToaster.module.css";

const transition = cssTransition({ enter: styles.enter, exit: styles.exit, collapse: false });

export function AppToaster() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(<ToastContainer
    className={styles.container}
    position="top-right"
    theme={resolvedTheme === "dark" ? "dark" : "light"}
    autoClose={4000}
    limit={3}
    hideProgressBar
    closeOnClick={false}
    pauseOnHover
    pauseOnFocusLoss
    transition={transition}
    icon={({ type }) => {
      const Icon = type === "success" ? CheckCircle2 : type === "error" || type === "warning" ? AlertCircle : type === "info" ? Info : Bell;
      return <Icon size={20} aria-hidden="true" />;
    }}
    closeButton={({ closeToast }) => <button type="button" className={styles.close} aria-label="Fechar notificação" onClick={closeToast}><X size={17} aria-hidden="true" /></button>}
  />, document.body);
}
