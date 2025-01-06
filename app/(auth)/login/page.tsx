"use client"
import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import ImageBack from "@/assets/images/imagem.jpg";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "react-toastify";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function LoginPage() {
  // const searchParams = useSearchParams();
  // const error = searchParams.get("error");

  // useEffect(() => {
  //   if (error) {
  //     toast(decodeURIComponent(error));
  //   }
  // });

  // const { data: user } = useCurrentUser();

  // if (user) {
  //   return (
  //     <div>
  //       <h1>vc ja esta logado</h1>
  //     </div>
  //   );
  // }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start"></div>
        <div className="flex flex-1 items-center justify-center ">
          <div className="w-full  max-w-screen-xl p-12 shadow-xl  rounded-xl">
            <div>
              <SidebarTrigger>
                <button
                  type="button"
                  className="text-gray-600 hover:text-gray-800 mr-3"
                >
                  ☰
                </button>
              </SidebarTrigger>
            </div>
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <Image
          src={ImageBack}
          alt="Background"
          layout="fill"
          objectFit="cover"
          className="dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
}
