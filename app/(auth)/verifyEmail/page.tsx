"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";

const VerifyEmailPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(false);
  const [showVerifyingMessage, setShowVerifyingMessage] = useState(true);

  useEffect(() => {
    if (token && loading) {
      fetch(`/api/verifyEmail?token=${token}`)
        .then((response) => response.json())
        .then((data) => {
          if (data.status === "success") {
            setVerified(true);
            setShowVerifyingMessage(false);
            setTimeout(() => {
              router.push("/login");
            }, 3000); // Redireciona após 3 segundos
          } else {
            setError(true);
            setShowVerifyingMessage(false);
          }
        })
        .catch(() => {
          setError(true);
          setShowVerifyingMessage(false);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [token, router, loading]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <div
        className={`p-8 rounded-lg shadow-lg text-center transition-all duration-500 ${
          verified ? "bg-green-100" : error ? "bg-red-100" : "bg-white"
        }`}
      >
        {showVerifyingMessage && (
          <>
            <h1 className="text-3xl font-bold mb-4 animate-pulse">Verificando Email...</h1>
            <p className="text-sm text-gray-600">
              Por favor, aguarde enquanto verificamos seu email.
            </p>
          </>
        )}

        {verified && (
          <div className="mt-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto animate-bounce" />
            <p className="text-xl font-semibold text-green-500 mt-4">
              Email verificado com sucesso!
            </p>
          </div>
        )}
        {error && (
          <div className="mt-4">
            <XCircle className="w-16 h-16 text-red-500 mx-auto animate-bounce" />
            <p className="text-xl font-semibold text-red-500 mt-4">
              Erro ao verificar o email.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailPage;