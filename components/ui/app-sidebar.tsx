"use client";
import React from "react";
import {
  Flame,
  Calendar1Icon,
  Settings,
  PersonStandingIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "./button";

import Image from "next/image";
import { LogoutButton } from "../MyComponents/LogoutButton ";

export function AppSidebar() {
  const router = useRouter();

  const { data, status: authenticated } = useSession();

  console.log("dados vindo", data);

  return (
    <Sidebar className="w-64 h-screen bg-white shadow-lg rounded-r-lg overflow-hidden">
      {/* Menu */}
      <SidebarContent className="mt-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="hover:bg-gray-100 transition-all rounded-lg px-4 py-2">
              <Flame className="w-5 h-5 mr-2 text-red-600" />
              <Link href={"/"}>
                <span className="text-gray-800">Eventos</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {authenticated === "authenticated" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  router.push("/Profile");
                }}
                className="hover:bg-gray-100 transition-all rounded-lg px-4 py-2"
              >
                <PersonStandingIcon className="w-5 h-5 mr-2" />
                <span className="text-gray-800">Profile</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {data?.user.role === "ADMIN" && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    router.push("/CriarEvento");
                  }}
                  className="hover:bg-gray-100 transition-all rounded-lg px-4 py-2"
                >
                  <Calendar1Icon className="w-5 h-5 mr-2" />
                  <span className="text-gray-800">Criar Eventos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer */}
      {authenticated === "authenticated" ? (
        <div className="absolute bottom-4 left-0 w-full px-6">
          <div className="flex items-center gap-3 border-t pt-4">
            {data?.user?.image ? (
              <Image
                width={32}
                height={32}
                src={data.user.image}
                alt="User Profile"
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                <span className="text-gray-500">N/A</span>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {data?.user?.name || "Usuário"}
              </p>
              <p className="text-xs text-gray-500">{data?.user?.email}</p>
            </div>
            <Settings className="ml-auto w-5 h-5 text-gray-400 hover:text-gray-700 cursor-pointer" />
          </div>
          <LogoutButton />
        </div>
      ) : (
        <div className="flex w-full items-center justify-center mb-4">
          <Button
            onClick={() => {
              router.push("/login");
            }}
            className="w-1/2 text-white"
          >
            Fazer Login
          </Button>
        </div>
      )}
    </Sidebar>
  );
}
