"use client";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

export function GoogleLoginButton() {
  const router = useRouter();

  const handleGoogleLogin = async () => {
    try {
      // Login sem redirecionamento automático
      const result = await signIn("google", {
        redirect: false, // Evita redirecionamento imediato
        callbackUrl: "/", // Define a URL para redirecionamento
      });

      console.log("Resultado do signIn:", result);

      if (result?.ok) {
        // Exibe o toast e redireciona
        toast.success("Login realizado com sucesso!");
        setTimeout(() => {
          router.push(result.url || "/");
        }, 1000); // Atraso para garantir que o toast seja exibido
      } else {
        toast.error(
          result?.error || "Erro ao realizar login. Tente novamente."
        );
      }
    } catch (error) {
      console.error("Erro ao realizar login:", error);
      toast.error("Erro inesperado ao realizar login.");
    }
  };

  return (
    <Button
      onClick={handleGoogleLogin}
      variant="outline"
      className="w-full"
      type="button"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-6 h-6"
      >
        <path
          fill="#4285F4"
          d="M23.49 12.27c0-.79-.07-1.55-.18-2.27H12v4.3h6.47c-.3 1.5-1.18 2.77-2.5 3.63v3h4.03c2.35-2.17 3.7-5.36 3.7-8.66z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.93l-4.03-3c-1.12.75-2.55 1.2-3.9 1.2-3 0-5.54-2.03-6.44-4.77H1.4v3.04C3.35 21.3 7.38 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.56 14.5c-.25-.75-.4-1.55-.4-2.38s.15-1.63.4-2.38V6.7H1.4C.5 8.47 0 10.17 0 12s.5 3.53 1.4 5.3l4.16-2.8z"
        />
        <path
          fill="#EA4335"
          d="M12 4.76c1.77 0 3.35.61 4.6 1.8l3.43-3.43C18.92 1.08 16.21 0 12 0 7.38 0 3.35 2.7 1.4 6.7l4.16 2.8c.9-2.74 3.44-4.74 6.44-4.74z"
        />
      </svg>
      Login com Google
    </Button>
  );
}
