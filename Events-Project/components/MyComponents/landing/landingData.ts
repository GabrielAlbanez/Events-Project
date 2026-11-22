// Dados estáticos e fictícios da página /conheca. Nada aqui vem do banco ou de APIs.

export type LandingCategory = "Música" | "Tecnologia" | "Feira" | "Cinema" | "Esporte" | "Gastronomia";
export type LandingWhen = "hoje" | "fds";

export type LandingEvent = {
  id: string;
  name: string;
  category: LandingCategory;
  price: string;
  when: LandingWhen;
  time: string;
  place: string;
  km: number;
  minutes: number;
  image: string;
  /** Posição do pin no mapa simulado, em % da largura (x) e da altura (y). */
  x: number;
  y: number;
};

/** Mapa simulado: viewBox 100 × 80 com o visitante no centro e raio máximo (10 km) de 36 unidades. */
export const MAP_VIEWBOX = { width: 100, height: 80, centerX: 50, centerY: 40, maxRadius: 36, maxKm: 10 } as const;

/** Escala ilustrativa em raiz quadrada: espalha os eventos próximos para os pins não se sobreporem no celular. */
export const mapRadius = (km: number) => MAP_VIEWBOX.maxRadius * Math.sqrt(Math.min(km, MAP_VIEWBOX.maxKm) / MAP_VIEWBOX.maxKm);

type RawEvent = Omit<LandingEvent, "x" | "y"> & { angle: number };

const RAW_EVENTS: RawEvent[] = [
  { id: "codigo", name: "Código & Café", category: "Tecnologia", price: "Gratuito", when: "hoje", time: "Hoje · 19h", place: "Rua Augusta · Consolação", km: 0.8, minutes: 4, image: "/branding/posters/poster-6.webp", angle: 160 },
  { id: "jazz", name: "Jazz no Terraço", category: "Música", price: "R$ 60,00", when: "hoje", time: "Hoje · 21h", place: "Terraço Augusta · Consolação", km: 1.2, minutes: 6, image: "/branding/home-jazz-v1.webp", angle: -60 },
  { id: "live", name: "Noite Live Session", category: "Música", price: "R$ 45,00", when: "fds", time: "Sáb · 22h", place: "Casa Bela Vista · Bixiga", km: 2.6, minutes: 11, image: "/branding/home-live-v1.webp", angle: 40 },
  { id: "feira", name: "Feira Criativa", category: "Feira", price: "Gratuito", when: "fds", time: "Sáb · 10h", place: "Praça Roosevelt · Centro", km: 3.4, minutes: 13, image: "/branding/posters/poster-1.webp", angle: 230 },
  { id: "mesa", name: "Mesa de Origens", category: "Gastronomia", price: "R$ 120,00", when: "fds", time: "Sáb · 20h", place: "Mercado de Pinheiros", km: 4.6, minutes: 17, image: "/branding/posters/poster-5.webp", angle: 120 },
  { id: "cinema", name: "Cinema na Laje", category: "Cinema", price: "R$ 20,00", when: "hoje", time: "Hoje · 20h", place: "Laje Cultural · Santana", km: 6.8, minutes: 22, image: "/branding/posters/poster-4.webp", angle: -20 },
  { id: "sunset", name: "Festival Pôr do Sol", category: "Música", price: "Gratuito", when: "fds", time: "Dom · 16h", place: "Parque Villa-Lobos", km: 8.5, minutes: 26, image: "/branding/home-sunset-v1.webp", angle: 200 },
  { id: "corrida", name: "Corrida Noturna 5K", category: "Esporte", price: "R$ 80,00", when: "fds", time: "Dom · 7h", place: "Parque Ibirapuera", km: 9.2, minutes: 28, image: "/branding/posters/poster-3.webp", angle: 80 },
];

// Arredondado para que servidor e navegador gerem exatamente o mesmo estilo (sem divergência de hidratação).
const round = (value: number) => Math.round(value * 100) / 100;

export const LANDING_EVENTS: LandingEvent[] = RAW_EVENTS.map(({ angle, ...event }) => {
  const radians = (angle * Math.PI) / 180;
  const radius = mapRadius(event.km);
  return {
    ...event,
    x: round(((MAP_VIEWBOX.centerX + Math.cos(radians) * radius) / MAP_VIEWBOX.width) * 100),
    y: round(((MAP_VIEWBOX.centerY + Math.sin(radians) * radius) / MAP_VIEWBOX.height) * 100),
  };
});

export const LANDING_CATEGORIES: LandingCategory[] = ["Música", "Gastronomia", "Feira", "Cinema", "Esporte", "Tecnologia"];

export const DISTANCE_OPTIONS = [2, 5, 10] as const;
export type DistanceOption = (typeof DISTANCE_OPTIONS)[number];

export const WHEN_OPTIONS: { value: LandingWhen | "qualquer"; label: string }[] = [
  { value: "qualquer", label: "Qualquer dia" },
  { value: "hoje", label: "Hoje" },
  { value: "fds", label: "Fim de semana" },
];

export const formatKm = (km: number) => `${km.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;

export const eventById = (id: string) => LANDING_EVENTS.find(event => event.id === id) ?? LANDING_EVENTS[0];
