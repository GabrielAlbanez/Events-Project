export type DemoCategory = "Música" | "Tecnologia" | "Gastronomia" | "Cultura" | "Esporte" | "Natureza";

/** Portfolio-only fixtures. Never send these IDs to application APIs. */
export interface DemoEvent {
  id: string;
  title: string;
  category: DemoCategory;
  location: string;
  description: string;
  startsAt: string;
  cover: string;
  admission: "gratuito" | "externo";
}

export function createDemoEvents(referenceDate: Date): DemoEvent[] {
  const entries: Omit<DemoEvent, "startsAt">[] = [
    { id: "demo-jazz", title: "Jazz no terraço", category: "Música", location: "São Paulo · Terraço Aurora (fictício)", description: "Uma noite de jazz, cidade e encontros ao pôr do sol.", cover: "/demo/jazz.svg", admission: "gratuito" },
    { id: "demo-codigo", title: "Código & café", category: "Tecnologia", location: "Curitiba · Laboratório Horizonte (fictício)", description: "Ideias, protótipos e conversas para quem constrói o próximo passo.", cover: "/demo/codigo.svg", admission: "gratuito" },
    { id: "demo-mesa", title: "Mesa de origens", category: "Gastronomia", location: "Belo Horizonte · Pátio Semente (fictício)", description: "Sabores regionais e histórias de quem transforma ingredientes.", cover: "/demo/mesa.svg", admission: "externo" },
    { id: "demo-cinema", title: "Cinema sob as estrelas", category: "Cultura", location: "Recife · Jardim da Tela (fictício)", description: "Curtas brasileiros e uma sessão de cinema ao ar livre.", cover: "/demo/cinema.svg", admission: "gratuito" },
    { id: "demo-corrida", title: "Corre, cidade", category: "Esporte", location: "Porto Alegre · Circuito do Sol (fictício)", description: "Um encontro de corrida leve, com espaço para todos os ritmos.", cover: "/demo/corrida.svg", admission: "gratuito" },
    { id: "demo-trilha", title: "Trilha do amanhecer", category: "Natureza", location: "Florianópolis · Parque Brisa (fictício)", description: "Uma caminhada guiada para observar a paisagem com calma.", cover: "/demo/trilha.svg", admission: "externo" },
  ];
  return entries.map((entry, index) => {
    const date = new Date(referenceDate);
    date.setUTCDate(date.getUTCDate() + 14 + index * 7);
    date.setUTCHours(index === 5 ? 9 : 21, 0, 0, 0);
    return { ...entry, startsAt: date.toISOString() };
  });
}
