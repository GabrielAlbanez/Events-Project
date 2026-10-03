import { Suspense } from "react";
import { AuthPageShell } from "@/components/MyComponents/AuthPageShell";
import { AccountRecoveryForm } from "@/components/MyComponents/AccountRecoveryForm";

export default function ResendVerificationPage() {
  return <AuthPageShell mode="login" formLabel="Reenviar confirmação de e-mail"><Suspense fallback={<p role="status">Carregando...</p>}><AccountRecoveryForm mode="resend" /></Suspense></AuthPageShell>;
}
