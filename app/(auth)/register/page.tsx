import { RegisterForm } from "@/components/register-form";
import { AuthPageShell } from "@/components/MyComponents/AuthPageShell";

export default function RegisterPage() {
  return <AuthPageShell mode="register"><RegisterForm /></AuthPageShell>;
}
