"use client";

import {
  CalendarCheck,
  CalendarPlus,
  Compass,
  LayoutDashboard,
  MapPinned,
  Plus,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "./button";
import { LogoutButton } from "@/components/MyComponents/LogoutButton ";
import { determineDefaultAvatar } from "@/utils/avatarUtils";
import { ThemeSwitcher } from "../MyComponents/ThemeSwitcher";

type NavItem = { label: string; href: string; icon: typeof Compass; roles?: string[] };

const navigation: NavItem[] = [
  { label: "Descobrir", href: "/", icon: Compass },
  { label: "Agenda de eventos", href: "/EventsCreated", icon: CalendarCheck },
  { label: "Minha agenda", href: "/salvos", icon: CalendarCheck, roles: ["ADMIN", "PROMOTER", "BASIC"] },
  { label: "Criar evento", href: "/CriarEvento", icon: CalendarPlus, roles: ["ADMIN", "PROMOTER"] },
  { label: "Meus eventos", href: "/myEvents", icon: LayoutDashboard, roles: ["ADMIN", "PROMOTER"] },
  { label: "Usuários", href: "/admin", icon: UsersRound, roles: ["ADMIN"] },
  { label: "Resultados", href: "/resultados", icon: LayoutDashboard, roles: ["ADMIN", "PROMOTER"] },
  { label: "Notificações", href: "/notificacoes", icon: CalendarCheck, roles: ["ADMIN", "PROMOTER", "BASIC"] },
  { label: "Meu perfil", href: "/Profile", icon: UserRound, roles: ["ADMIN", "PROMOTER", "BASIC"] },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const role = session?.user?.role ?? "BASIC";
  const visibleItems = navigation.filter((item) => !item.roles || item.roles.includes(role));
  const avatar = session?.user?.image || determineDefaultAvatar(session?.user?.name || "EventMap");

  return (
    <Sidebar className="h-screen w-[292px] overflow-hidden border-r border-white/70 bg-white/90 shadow-[18px_0_50px_-32px_rgba(46,16,101,.4)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#111018]/90">
      <div className="px-5 pb-4 pt-6">
        <Link href="/" className="group flex items-center gap-3 rounded-2xl p-1 transition hover:opacity-80">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-700 to-indigo-700 text-white shadow-lg shadow-violet-700/25 transition group-hover:rotate-3 group-hover:scale-105">
            <MapPinned className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight">
              EventMap <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            </div>
            <p className="text-xs text-zinc-500">Descubra. Encontre. Viva.</p>
          </div>
        </Link>
      </div>

      <div className="mx-4 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 p-4 dark:border-violet-400/10 dark:from-violet-500/10 dark:to-indigo-500/5">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
          <span className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,.12)]" />
          Eventos acontecendo agora
        </div>
        <Button asChild className="h-10 w-full rounded-xl bg-zinc-950 text-white shadow-lg hover:bg-violet-700 dark:bg-white dark:text-zinc-950">
          <Link href="/EventsCreated">Explorar agenda</Link>
        </Button>
      </div>

      <SidebarContent className="px-3 py-5">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Navegação</p>
        <SidebarMenu className="gap-1.5">
          {visibleItems.map(({ label, href, icon: Icon }) => {
            const active = href === "/" ? pathname === href : pathname.startsWith(href);
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={active} className="relative h-11 rounded-xl px-3 font-medium text-zinc-600 transition-all duration-200 hover:translate-x-0.5 hover:bg-violet-50 hover:text-violet-700 data-[active=true]:bg-gradient-to-r data-[active=true]:from-violet-700 data-[active=true]:to-indigo-700 data-[active=true]:text-white data-[active=true]:shadow-lg data-[active=true]:shadow-violet-700/20 dark:text-zinc-300 dark:hover:bg-violet-400/10">
                  <Link href={href}>
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {(role === "ADMIN" || role === "PROMOTER") && (
        <div className="px-4 pb-3">
          <Button asChild variant="outline" className="h-11 w-full rounded-xl border-dashed border-violet-300 text-violet-700 hover:border-violet-500 hover:bg-violet-50 dark:border-violet-400/30 dark:text-violet-300">
            <Link href="/CriarEvento"><Plus className="h-4 w-4" /> Novo evento</Link>
          </Button>
        </div>
      )}

      <div className="border-t border-zinc-100 bg-zinc-50/60 p-4 dark:border-white/10 dark:bg-white/[.02]">
        {status === "authenticated" ? (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-200/70 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
              <Image width={40} height={40} src={avatar} alt="Foto do perfil" className="h-10 w-10 rounded-xl object-cover ring-2 ring-violet-100 dark:ring-violet-400/20" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{session.user.name || "Usuário"}</p>
                <p className="truncate text-xs text-zinc-500">{session.user.email}</p>
              </div>
              <ThemeSwitcher />
            </div>
            <LogoutButton />
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-zinc-500">Entre para publicar eventos e salvar suas descobertas.</p>
            <Button asChild className="w-full rounded-xl bg-violet-700 hover:bg-violet-800">
              <Link href="/login">Entrar na plataforma</Link>
            </Button>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
