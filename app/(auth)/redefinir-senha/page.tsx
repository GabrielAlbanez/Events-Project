import { Suspense } from "react";
import { AuthPageShell } from "@/components/MyComponents/AuthPageShell";
import { AccountRecoveryForm } from "@/components/MyComponents/AccountRecoveryForm";

export default function ResetPasswordPage() {
  return <AuthPageShell mode="login" formLabel="Redefinir senha"><Suspense fallback={<p role="status">Carregando...</p>}><AccountRecoveryForm mode="reset" /></Suspense></AuthPageShell>;
}
