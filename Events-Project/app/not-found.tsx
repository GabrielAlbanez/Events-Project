import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Compass, MapPinned, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false },
};

const shortcuts = [
  { href: "/EventsCreated", label: "Agenda de eventos", description: "Veja tudo o que está programado.", icon: CalendarDays },
  { href: "/#home-discovery", label: "Mapa de eventos", description: "Encontre experiências perto de você.", icon: MapPinned },
  { href: "/#home-discovery-search", label: "Buscar eventos", description: "Procure por nome, lugar ou estilo.", icon: Search },
];

export default function NotFound() {
  return (
    <div className="w-full min-w-0 px-4 py-10 sm:px-6 lg:px-10 lg:py-16">
      <section aria-labelledby="not-found-title" className="mx-auto max-w-3xl rounded-3xl border bg-card p-6 shadow-sm sm:p-10">
        <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-brand">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </span>
        <PageHeader
          eyebrow="Erro 404"
          title="Não encontramos esta página"
          titleId="not-found-title"
          description="O endereço pode ter mudado, o evento pode ter sido removido ou o link está incompleto. Que tal continuar explorando?"
        />
        <ul className="mt-7 grid gap-3 sm:grid-cols-3">
          {shortcuts.map(({ href, label, description, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex h-full min-h-11 flex-col gap-2 rounded-2xl border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none">
                <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
                <span className="font-semibold">{label}</span>
                <span className="text-sm leading-6 text-muted-foreground">{description}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-7">
          <Button asChild size="lg" className="min-h-11 rounded-xl">
            <Link href="/">Voltar ao início</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
