type Schedule = { dataInicio: string; dataFim: string; startTime?: string | null; endTime?: string | null; endereco: string; lat?: number | null; lng?: number | null };
export function eventUpdateNotice(previous: Schedule & { nome: string }, next: Schedule): { title: string; message: string } {
 const changes: string[] = [];
 if (previous.dataInicio !== next.dataInicio || previous.dataFim !== next.dataFim) changes.push("data");
 if ((previous.startTime || "") !== (next.startTime || "") || (previous.endTime || "") !== (next.endTime || "")) changes.push("horário");
 if (previous.endereco.trim() !== next.endereco.trim() || (previous.lat ?? null) !== (next.lat ?? null) || (previous.lng ?? null) !== (next.lng ?? null)) changes.push("local");
 return { title: changes.length ? "Programação alterada" : "Evento atualizado", message: previous.nome + (changes.length ? ": alteração de " + changes.join(", ") + "." : ": informações atualizadas.") + " A atualização está em revisão. Você receberá um aviso quando for publicada." };
}
