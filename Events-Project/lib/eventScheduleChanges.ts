type Schedule = { dataInicio: string; dataFim: string; startTime?: string | null; endTime?: string | null; endereco: string; lat?: number | null; lng?: number | null };
export function eventUpdateNotice(previous: Schedule & { nome: string }, next: Schedule): { title: string; message: string } {
 const changes = scheduleChanges(previous, next);
 return { title: changes.length ? "Programação alterada" : "Evento atualizado", message: previous.nome + (changes.length ? ": alteração de " + changes.join(", ") + "." : ": informações atualizadas.") + " A atualização está em revisão. Você receberá um aviso quando for publicada." };
}

// Legacy rows may store full ISO timestamps; the form always sends YYYY-MM-DD.
const day = (value: string) => value.trim().slice(0, 10);
const text = (value: string | null | undefined) => (value ?? "").trim();

/** Date, time and place changes that attendees must hear about. */
export function scheduleChanges(previous: Schedule, next: Schedule): Array<"data" | "horário" | "local"> {
 const changes: Array<"data" | "horário" | "local"> = [];
 if (day(previous.dataInicio) !== day(next.dataInicio) || day(previous.dataFim) !== day(next.dataFim)) changes.push("data");
 if (text(previous.startTime) !== text(next.startTime) || text(previous.endTime) !== text(next.endTime)) changes.push("horário");
 if (text(previous.endereco) !== text(next.endereco) || (previous.lat ?? null) !== (next.lat ?? null) || (previous.lng ?? null) !== (next.lng ?? null)) changes.push("local");
 return changes;
}

/**
 * Fields whose change on a PUBLISHED event requires a new administrative review.
 * Everything else (description, images, category, accessibility, age rating,
 * participation conditions and capacity increases) is published immediately.
 */
export type SensitiveEventFields = Schedule & {
 nome: string;
 linkParaCompra: string;
 isFree: boolean;
 priceCents: number;
 capacity: number | null;
 /** Omit when the client did not send it: the stored value is preserved. */
 organizerName?: string | null;
};

export const sensitiveFieldLabels = {
 nome: "nome",
 data: "data",
 horário: "horário",
 local: "local",
 linkParaCompra: "link de ingressos",
 preço: "preço",
 capacity: "redução de vagas",
 organizerName: "organização responsável",
 banner: "capa",
} as const;
export type SensitiveChange = (typeof sensitiveFieldLabels)[keyof typeof sensitiveFieldLabels];

export function sensitiveEventChanges(previous: SensitiveEventFields, next: SensitiveEventFields): SensitiveChange[] {
 const changes: SensitiveChange[] = [];
 if (text(previous.nome) !== text(next.nome)) changes.push(sensitiveFieldLabels.nome);
 for (const change of scheduleChanges(previous, next)) changes.push(sensitiveFieldLabels[change]);
 if (text(previous.linkParaCompra) !== text(next.linkParaCompra)) changes.push(sensitiveFieldLabels.linkParaCompra);
 const previousPrice = previous.isFree ? 0 : previous.priceCents;
 const nextPrice = next.isFree ? 0 : next.priceCents;
 if (previous.isFree !== next.isFree || previousPrice !== nextPrice) changes.push(sensitiveFieldLabels.preço);
 // Removing the limit or adding places never hurts confirmed attendees.
 if (next.capacity !== null && (previous.capacity === null || next.capacity < previous.capacity)) changes.push(sensitiveFieldLabels.capacity);
 if (next.organizerName !== undefined && previous.organizerName !== undefined && text(previous.organizerName) !== text(next.organizerName)) changes.push(sensitiveFieldLabels.organizerName);
 return changes;
}
