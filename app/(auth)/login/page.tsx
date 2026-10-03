import { LoginForm } from "@/components/login-form";
import { AuthPageShell } from "@/components/MyComponents/AuthPageShell";

export default function LoginPage() {
  return <AuthPageShell mode="login"><LoginForm /></AuthPageShell>;
}
