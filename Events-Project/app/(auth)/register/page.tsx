import { RegisterForm } from "@/components/register-form";
import { LoginPageShell } from "@/components/MyComponents/LoginPageShell";
import { redirectAuthenticatedAccount } from "@/lib/auth/authPage";

export default async function RegisterPage({ searchParams }: { searchParams?: { callbackUrl?: string | string[] } }) {
  await redirectAuthenticatedAccount(searchParams?.callbackUrl);
  return <LoginPageShell mode="register"><RegisterForm /></LoginPageShell>;
}
