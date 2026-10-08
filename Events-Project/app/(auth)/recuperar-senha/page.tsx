import { Suspense } from "react";
import { AuthPageShell } from "@/components/MyComponents/AuthPageShell";
import { AccountRecoveryForm } from "@/components/MyComponents/AccountRecoveryForm";

export default function RecoveryPage() {
  return <AuthPageShell mode="login" formLabel="Recuperar acesso à conta"><Suspense fallback={<p role="status">Carregando...</p>}><AccountRecoveryForm mode="recovery" /></Suspense></AuthPageShell>;
}
