import { EventoForm } from "@/components/MyComponents/EventoForm";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function CriarEvento() {
  return (
    <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-start gap-4">
          <SidebarTrigger className="mt-1 shrink-0" />
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">Painel de eventos</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Criar evento</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Conte o essencial, escolha o local e adicione imagens. As dicas em cada etapa ajudam você a preparar um evento fácil de encontrar.
            </p>
          </div>
        </div>
        <EventoForm />
      </div>
    </main>
  );
}
