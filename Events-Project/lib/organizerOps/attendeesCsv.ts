// CSV de participantes (OPP-05). Separador ";" porque o Excel em pt-BR usa a vírgula
// como separador decimal e abre arquivos com ";" diretamente em colunas.
export const csvSeparator = ";";
export const csvBom = "﻿";
export const attendeeCsvHeader = ["nome", "e-mail", "status", "inscrito em", "check-in em"] as const;

export type AttendeeCsvRow = {
  status: string;
  createdAt: Date | string;
  checkedInAt: Date | string | null;
  user: { name: string | null; email: string | null };
};

const statusLabels: Record<string, string> = {
  CONFIRMED: "Confirmado",
  WAITLISTED: "Lista de espera",
  CHECKED_IN: "Entrada registrada",
  CANCELLED: "Cancelado",
};

/** Neutraliza fórmulas (CSV injection) e aplica as aspas exigidas pelo RFC 4180. */
export function csvCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return /[";\r\n,]/.test(neutralized) ? '"' + neutralized.replace(/"/g, '""') + '"' : neutralized;
}

export function formatCsvDate(value: Date | string | null, timeZone: string): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(",", "");
  } catch {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(",", "");
  }
}

export function attendeesCsv(rows: AttendeeCsvRow[], timeZone: string): string {
  const lines = [attendeeCsvHeader.map(csvCell).join(csvSeparator)];
  for (const row of rows) {
    lines.push([
      row.user.name?.trim() || "",
      row.user.email ?? "",
      statusLabels[row.status] ?? row.status,
      formatCsvDate(row.createdAt, timeZone),
      formatCsvDate(row.checkedInAt, timeZone),
    ].map(csvCell).join(csvSeparator));
  }
  return csvBom + lines.join("\r\n") + "\r\n";
}

export function attendeesCsvFilename(eventName: string): string {
  const slug = eventName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return "participantes-" + (slug || "evento") + ".csv";
}
