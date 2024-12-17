import EventoForm from "@/components/MyComponents/EventoForm";

export default function CriarEvento() {
  return (
    <div className="flex-1 flex flex-col gap-6 items-center justify-center p-6 bg-gray-50">
      {/* Conteúdo principal */}
      <div className="w-full max-w-3xl bg-white p-8 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          Criar Eventos
        </h1>
        <EventoForm />
      </div>
    </div>
  );
}
