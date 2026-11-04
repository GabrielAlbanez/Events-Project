const catalogs = [
  ["São Paulo", "sao-paulo-sp"], ["Campinas", "campinas-sp"], ["Rio de Janeiro", "rio-de-janeiro-rj"],
  ["Belo Horizonte", "belo-horizonte-mg"], ["Brasília", "brasilia-df"], ["Salvador", "salvador-ba"],
  ["Porto Alegre", "porto-alegre-rs"], ["Curitiba", "curitiba-pr"], ["Fortaleza", "fortaleza-ce"],
  ["Recife", "recife-pe"], ["Goiânia", "goiania-go"], ["Florianópolis", "florianopolis-sc"],
] as const;

export const PUBLIC_EVENT_CITIES = catalogs.map(([city]) => city);

const normalizeCity = (city: string) =>
  city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function publicCatalogUrl(city: string): string {
  const catalog = catalogs.find(([name]) => normalizeCity(name) === normalizeCity(city));
  if (!catalog) throw new Error("Esta cidade ainda não possui catálogo automático. Envie o link oficial de um evento para verificação.");
  return "https://www.sympla.com.br/eventos/" + catalog[1];
}
