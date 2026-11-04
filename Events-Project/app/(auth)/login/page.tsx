import { LoginForm } from "@/components/login-form";
import { LoginPageShell } from "@/components/MyComponents/LoginPageShell";
import { redirectAuthenticatedAccount } from "@/lib/auth/authPage";

export default async function LoginPage({ searchParams }: { searchParams?: { callbackUrl?: string | string[] } }) {
  await redirectAuthenticatedAccount(searchParams?.callbackUrl);
  return <LoginPageShell><LoginForm /></LoginPageShell>;
}
