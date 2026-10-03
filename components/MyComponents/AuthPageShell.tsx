import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Sparkles, Users } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AuthPageShell({ children, mode }: { children: ReactNode; mode: "login" | "register" }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="h-10 w-10 rounded-xl border border-border" />
          <Link href="/" className="flex items-center gap-2.5 rounded-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><MapPin className="h-5 w-5" aria-hidden="true" /></span>EventMap</Link>
        </div>
        <Link href="/" className="flex items-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Voltar para explorar</span><span className="sm:hidden">Explorar</span></Link>
      </header>
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-10 sm:px-8 sm:py-14 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] xl:gap-16">
        <section className="relative hidden min-w-0 overflow-hidden rounded-[2rem] border border-primary/15 bg-primary/5 p-10 xl:block" aria-labelledby="auth-introduction">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1.5 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Descubra. Encontre. Viva.</span>
            <h2 id="auth-introduction" className="mt-7 text-4xl font-semibold leading-tight tracking-tight">Seu próximo momento<br /><span className="text-primary">começa por aqui.</span></h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">Encontre eventos que combinam com você e pessoas para compartilhar a experiência.</p>
            <div className="mt-10 space-y-3">
              {[
                { icon: MapPin, title: "Descubra por perto", text: "Explore eventos no mapa e encontre seu lugar." },
                { icon: CalendarDays, title: "Organize seus planos", text: "Salve favoritos e acompanhe sua agenda." },
                { icon: Users, title: "Viva junto", text: "Conheça a comunidade de cada evento." },
              ].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-start gap-4 rounded-2xl border border-border/60 bg-background/80 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div></div>)}
            </div>
          </div>
        </section>
        <section className="mx-auto w-full min-w-0 max-w-md" aria-label={mode === "login" ? "Entrar na conta" : "Criar uma conta"}>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">{children}</div>
          <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">{mode === "login" ? "Seus eventos, suas conexões e sua agenda em um só lugar." : "Crie sua conta e encontre novas experiências para viver."}</p>
        </section>
      </div>
    </div>
  );
}
