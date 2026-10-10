"use client";

import {
  CalendarCheck,
  CalendarPlus,
  Compass,
  LayoutDashboard,
  Plus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ProfileAvatar } from "@/components/MyComponents/ProfileAvatar";
import { BrandLogo } from "@/components/MyComponents/BrandLogo";

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
    { label: "Administrar", paths: ["/admin", "/admin/conexoes-denuncias", "/admin/auditoria"] },
  ];
  const avatar = authenticatedUser?.image || determineDefaultAvatar(authenticatedUser?.name || "EventMap");

  return (
    <Sidebar className="h-screen w-[292px] overflow-hidden border-r border-sidebar-border bg-sidebar shadow-surface">
      <div className="shrink-0 px-4 pb-3 pt-3 md:px-5 md:pb-4 md:pt-6">
        <Link href="/" className="group flex items-center gap-3 rounded-2xl p-1 transition hover:opacity-80">
          <div className="min-w-0">
            <BrandLogo />
            <p className="mt-2 text-xs text-muted-foreground">Descubra. Encontre. Viva.</p>
          </div>
        </Link>
      </div>

      <SidebarContent className="overscroll-contain px-3 py-3 md:py-5">
        {groups.map(group => {
          const items = visibleItems.filter(item => group.paths.includes(item.href));
          if (!items.length) return null;
          return <section key={group.label} className="mb-3 shrink-0 md:mb-5" aria-label={group.label}><p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.label}</p>
        <SidebarMenu className="gap-1 md:gap-1.5">
          {items.map(({ label, href, icon: Icon }) => {
            const active = href === "/" || href === "/admin" ? pathname === href : pathname.startsWith(href);
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={active} className="relative h-11 shrink-0 rounded-xl px-3 font-medium text-sidebar-foreground transition-all duration-200 hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-primary data-[active=true]:font-semibold data-[active=true]:ring-1 data-[active=true]:ring-inset data-[active=true]:ring-sidebar-border">
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
        <div className="hidden shrink-0 px-4 pb-3 md:block">
          <Button asChild variant="outline" className="h-11 w-full rounded-xl border-border text-sidebar-foreground hover:border-primary/30 hover:bg-muted">
            <Link href="/CriarEvento"><Plus className="h-4 w-4" /> Novo evento</Link>
          </Button>
        </div>
      )}

      <div className="shrink-0 border-t border-sidebar-border bg-sidebar-accent/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4">
        <div className="mb-2 flex items-center justify-between gap-2 md:mb-3">
          <span className="text-sm font-medium text-sidebar-foreground">Aparência</span>
          <ThemeSwitcher />
        </div>
        {authenticatedUser ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 shadow-surface md:rounded-2xl md:p-3">
              <ProfileAvatar preview size={40} src={avatar} name={authenticatedUser.name} className="h-10 w-10 rounded-xl object-cover ring-2 ring-border" />
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
          <div className="space-y-2 md:space-y-3">
            <p className="hidden text-sm leading-6 text-muted-foreground md:block">Entre para publicar eventos e salvar suas descobertas.</p>
            <Button asChild className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/login">Entrar na plataforma</Link>
            </Button>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
