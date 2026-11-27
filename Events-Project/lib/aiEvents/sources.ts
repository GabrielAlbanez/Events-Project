export type PlatformId = "sympla" | "ticket360" | "eventim" | "ingresse" | "sescsp";

const platforms: { id: PlatformId; domain: string; label: string }[] = [
  { id: "sympla", domain: "sympla.com.br", label: "Sympla" },
  { id: "ticket360", domain: "ticket360.com.br", label: "Ticket360" },
  { id: "eventim", domain: "eventim.com.br", label: "Eventim" },
  { id: "ingresse", domain: "ingresse.com", label: "Ingresse" },
  { id: "sescsp", domain: "sescsp.org.br", label: "Sesc SP" },
];

/** Plataforma de origem de um link oficial, para o selo "Importado de …". */
export function platformOf(sourceUrl: string): { id: PlatformId | null; label: string } {
  let host: string;
  try { host = new URL(sourceUrl).hostname.toLowerCase(); } catch { return { id: null, label: "fonte oficial" }; }
  const platform = platforms.find(item => host === item.domain || host.endsWith("." + item.domain));
  return platform ? { id: platform.id, label: platform.label } : { id: null, label: "fonte oficial" };
}

export function importedBadge(sourceUrl: string): string {
  return "Importado de " + platformOf(sourceUrl).label;
}

/**
 * Links de páginas de evento da Ticket360 presentes no HTML ou nos dados da página (inclusive com "\/").
 * Host fixo e id/slug restritos: não depende do canonicalizador do provider, que importa este módulo.
 */
export function ticket360EventLinks(body: string): string[] {
  const text = body.replace(/\\\//g, "/");
  const links: string[] = [];
  for (const match of Array.from(text.matchAll(/(?:https:\/\/www\.ticket360\.com\.br)?\/evento\/(\d{1,9})\/([a-z0-9-]{1,120})/gi))) {
    const url = `https://www.ticket360.com.br/evento/${match[1]}/${match[2].toLowerCase()}`;
    if (!links.includes(url)) links.push(url);
  }
  return links;
}

const simplify = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Compara a cidade do endereço oficial (JSON-LD) com a cidade escolhida. Brasília também casa com a UF "DF". */
export function sameCity(locality: string | undefined, region: string | undefined, city: string): boolean {
  const wanted = simplify(city);
  if (!wanted) return false;
  if (locality && simplify(locality) === wanted) return true;
  return wanted === "brasilia" && !!region && simplify(region) === "df";
}
