"use client";
import React from "react";
import {
  Flame,
  Calendar1Icon,
  Settings,
  PersonStandingIcon,
  AmpersandIcon,
  Shield,
  Users,
  CalendarSearch,
  CalendarCheck,
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
import { LogoutButton } from "@/components/MyComponents/LogoutButton ";
import { determineDefaultAvatar } from "@/utils/avatarUtils";
import { ThemeSwitcher } from "../MyComponents/ThemeSwitcher";

export function AppSidebar() {
  const router = useRouter();
  const { data: session, status } = useSession();

  console.log("Session status:", status);
  console.log("Session data:", session);

  return (
    <Sidebar className="w-64 h-screen bg-white shadow-lg rounded-r-lg overflow-hidden">
      {/* Menu */}
      <SidebarContent className="mt-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className=" transition-all rounded-lg px-4 py-2">
              <Flame className="w-5 h-5 mr-2 text-red-600" />
              <Link href={"/"}>
                <span className="text-foreground">Eventos</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {status === "authenticated" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  router.push("/Profile");
                }}
                className=" transition-all rounded-lg px-4 py-2"
              >
                <PersonStandingIcon className="w-5 h-5 mr-2" />
                <span className="text-foreground">Profile</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {session?.user?.role === "ADMIN" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  router.push("/CriarEvento");
                }}
                className=" transition-all rounded-lg px-4 py-2"
              >
                <Calendar1Icon className="w-5 h-5 mr-2" />
                <span className="text-foreground">Criar Eventos</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {session?.user?.role === "ADMIN" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  router.push("/admin");
                }}
                className=" transition-all rounded-lg px-4 py-2"
              >
                <Users className="w-5 h-5 mr-2" />
                <span className="text-foreground">Users</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {session?.user?.role === "ADMIN" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  router.push("/EventsCreated");
                }}
                className=" transition-all rounded-lg px-4 py-2"
              >
                <CalendarCheck className="w-5 h-5 mr-2" />
                <span className="text-foreground">Events-Created</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {session?.user?.role === "PROMOTER" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  router.push("/CriarEvento");
                }}
                className=" transition-all rounded-lg px-4 py-2"
              >
                <Calendar1Icon className="w-5 h-5 mr-2" />
                <span className="text-foreground">Criar Eventos</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {session?.user?.role === "ADMIN" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  router.push("/myEvents");
                }}
                className=" transition-all rounded-lg px-4 py-2"
              >
                <CalendarSearch className="w-5 h-5 mr-2" />
                <span className="text-foreground">My events</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {session?.user?.role === "PROMOTER" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  router.push("/myEvents");
                }}
                className=" transition-all rounded-lg px-4 py-2"
              >
                <CalendarSearch className="w-5 h-5 mr-2" />
                <span className="text-foreground">My events</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer */}
      {status === "authenticated" ? (
        <div className="absolute bottom-4 left-0 w-full px-6">
          <div className="flex items-center gap-3 border-t pt-4">
            {session?.user?.image ? (
              <Image
                width={32}
                height={32}
                src={session.user.image}
                alt="User Profile"
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                <Image
                  width={32}
                  height={32}
                  src={determineDefaultAvatar(session.user.name || "")}
                  alt="User Profile"
                  className="w-8 h-8 rounded-full"
                />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-foreground flex  items-center justify-start">
                {session?.user?.name || "Usuário"}
                <ThemeSwitcher />

              </p>
              <p className="text-xs text-foreground">{session?.user?.email}</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      ) : (
        <div className="flex w-full items-center justify-center mb-4">
          <Button
            onClick={() => {
              router.push("/login");
            }}
            className="w-1/2"
          >
            Fazer Login
          </Button>
        </div>
      )}
    </Sidebar>
  );
}
