"use client";
import React from "react";
import {
  MapPin,
  Route,
  Trash2,
  LayoutDashboard,
  Settings,
  User,
  Flame,
  Calendar1Icon,
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

export function AppSidebar() {
  const router = useRouter();

  return (
    <Sidebar className="w-64 h-screen bg-white shadow-lg rounded-r-lg overflow-hidden">
      {/* Menu */}
      <SidebarContent className="mt-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="hover:bg-gray-100 transition-all rounded-lg px-4 py-2">
              <Flame className="w-5 h-5 mr-2 text-red-600" />

              <Link href={"/"}>
                {" "}
                <span className="text-gray-800">Eventos</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

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
        </SidebarMenu>
      </SidebarContent>

      {/* Footer */}
      <div className="absolute bottom-4 left-0 w-full px-6">
        <div className="flex items-center gap-3 border-t pt-4">
          <User className="w-8 h-8 rounded-full bg-gray-300 p-1 text-gray-600" />
          <div>
            <p className="text-sm font-semibold text-gray-800">shadcn</p>
            <p className="text-xs text-gray-500">m@example.com</p>
          </div>
          <Settings className="ml-auto w-5 h-5 text-gray-400 hover:text-gray-700 cursor-pointer" />
        </div>
      </div>
    </Sidebar>
  );
}
