import type { Evento } from "@/types";
export function buildPlanInvite(events: Evento[], origin: string): string {
 const base = new URL(origin);
 if (!["http:", "https:"].includes(base.protocol)) throw new Error("Invalid origin");
 const selected = Array.from(new Map(events.filter(event => event.status === "PUBLISHED").map(event => [event.id, event])).values()).slice(0, 5);
 if (!selected.length) throw new Error("Selecione ao menos um evento publicado.");
 return "Vamos combinar a próxima saída?\n\n" + selected.map(event => [event.nome, event.dataInicio + (event.startTime ? " · " + event.startTime : "") + (event.timezone ? " (" + event.timezone + ")" : ""), event.endereco, new URL("/eventos/" + encodeURIComponent(event.id), base.origin).href].join("\n")).join("\n\n");
}
