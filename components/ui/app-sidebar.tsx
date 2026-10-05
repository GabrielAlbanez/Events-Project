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
  { label: "Central de atividades", href: "/atividade", icon: LayoutDashboard, roles: ["ADMIN", "PROMOTER", "BASIC"] },
  { label: "Salas com amigos", href: "/salas", icon: UsersRound, roles: ["ADMIN", "PROMOTER", "BASIC"] },
  { label: "Criar evento", href: "/CriarEvento", icon: CalendarPlus, roles: ["ADMIN", "PROMOTER"] },
  { label: "Meus eventos", href: "/myEvents", icon: LayoutDashboard, roles: ["ADMIN", "PROMOTER"] },
  { label: "Usuários", href: "/admin", icon: UsersRound, roles: ["ADMIN"] },
  { label: "Revisar denúncias", href: "/admin/conexoes-denuncias", icon: UsersRound, roles: ["ADMIN"] },
  { label: "Resultados", href: "/resultados", icon: LayoutDashboard, roles: ["ADMIN", "PROMOTER"] },
  { label: "Notificações", href: "/notificacoes", icon: CalendarCheck, roles: ["ADMIN", "PROMOTER", "BASIC"] },
  { label: "Meu perfil", href: "/Profile", icon: UserRound, roles: ["ADMIN", "PROMOTER", "BASIC"] },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const authenticatedUser = status === "authenticated" && session?.user?.id ? session.user : null;
  const role = authenticatedUser?.role;
  const visibleItems = navigation.filter((item) => !item.roles || (role !== null && role !== undefined && item.roles.includes(role)));
  const groups = [
    { label: "Descobrir", paths: ["/", "/EventsCreated"] },
    { label: "Participar", paths: ["/salvos", "/atividade", "/salas", "/notificacoes", "/Profile"] },
    { label: "Organizar", paths: ["/CriarEvento", "/myEvents", "/resultados"] },
    { label: "Administrar", paths: ["/admin", "/admin/conexoes-denuncias"] },
  ];
  const avatar = authenticatedUser?.image || determineDefaultAvatar(authenticatedUser?.name || "EventMap");

  return (
    <Sidebar className="h-screen w-[292px] overflow-hidden border-r border-sidebar-border bg-sidebar shadow-surface">
      <div className="px-5 pb-4 pt-6">
        <Link href="/" className="group flex items-center gap-3 rounded-2xl p-1 transition hover:opacity-80">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-highlight transition group-hover:rotate-3 group-hover:scale-105">
            <MapPinned className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight">
              EventMap <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Descubra. Encontre. Viva.</p>
          </div>
        </Link>
      </div>

      <div className="mx-4 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-primary">
          <span className="h-2 w-2 rounded-full bg-primary shadow-highlight" />
          Encontre sua próxima experiência
        </div>
        <Button asChild className="h-10 w-full rounded-xl bg-primary text-primary-foreground shadow-highlight hover:bg-primary/90">
          <Link href="/EventsCreated">Explorar agenda</Link>
        </Button>
      </div>

      <SidebarContent className="px-3 py-5">
        {groups.map(group => {
          const items = visibleItems.filter(item => group.paths.includes(item.href));
          if (!items.length) return null;
          return <section key={group.label} className="mb-5" aria-label={group.label}><p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.label}</p>
        <SidebarMenu className="gap-1.5">
          {items.map(({ label, href, icon: Icon }) => {
            const active = href === "/" || href === "/admin" ? pathname === href : pathname.startsWith(href);
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={active} className="relative h-11 rounded-xl px-3 font-medium text-sidebar-foreground transition-all duration-200 hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-highlight">
                  <Link href={href}>
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu></section>; })}
      </SidebarContent>

      {(role === "ADMIN" || role === "PROMOTER") && (
        <div className="px-4 pb-3">
          <Button asChild variant="outline" className="h-11 w-full rounded-xl border-dashed border-primary/30 text-primary hover:border-primary hover:bg-muted">
            <Link href="/CriarEvento"><Plus className="h-4 w-4" /> Novo evento</Link>
          </Button>
        </div>
      )}

      <div className="border-t border-sidebar-border bg-sidebar-accent/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-sidebar-foreground">Aparência</span>
          <ThemeSwitcher />
        </div>
        {authenticatedUser ? (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-surface">
              <Image width={40} height={40} src={avatar} alt="Foto do perfil" className="h-10 w-10 rounded-xl object-cover ring-2 ring-border" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{authenticatedUser.name || "Usuário"}</p>
                <p className="truncate text-xs text-muted-foreground">{authenticatedUser.email}</p>
              </div>
            </div>
            <LogoutButton />
          </>
        ) : status === "loading" ? (
          <p role="status" className="text-sm text-muted-foreground">Carregando conta...</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">Entre para publicar eventos e salvar suas descobertas.</p>
            <Button asChild className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/login">Entrar na plataforma</Link>
            </Button>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
