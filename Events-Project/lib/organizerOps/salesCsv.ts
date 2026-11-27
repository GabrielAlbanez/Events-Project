import { csvBom, csvCell, csvSeparator, formatCsvDate } from "@/lib/organizerOps/attendeesCsv";

export const salesCsvHeader = ["evento", "pedido", "comprador", "ingressos", "valor unitário (R$)", "total (R$)", "comissão EventMap (R$)", "líquido (R$)", "status", "pago em", "estornado em"] as const;
export const salesCsvFilename = "vendas-eventmap.csv";

export type SalesCsvRow = {
  eventName: string;
  code: string;
  buyerName: string;
  status: string;
  unitCents: number;
  quantity: number;
  feeCents: number;
  paidAt: Date | string | null;
  refundedAt: Date | string | null;
};

const statusLabels: Record<string, string> = { PAID: "Pago", REFUNDED: "Estornado" };

/** "1234" -> "12,34": Excel pt-BR reads it as a number. */
function amount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const value = Math.abs(cents);
  return `${sign}${Math.floor(value / 100)},${String(value % 100).padStart(2, "0")}`;
}

export function salesCsv(rows: SalesCsvRow[], timeZone = "America/Sao_Paulo"): string {
  const lines = [salesCsvHeader.map(csvCell).join(csvSeparator)];
  for (const row of rows) {
    const total = row.unitCents * row.quantity;
    const money = [row.unitCents, total, row.feeCents, total - row.feeCents].map(amount);
    const text = [row.eventName, row.code, row.buyerName].map(csvCell);
    const dates = [statusLabels[row.status] ?? row.status, formatCsvDate(row.paidAt, timeZone), formatCsvDate(row.refundedAt, timeZone)].map(csvCell);
    // Amounts skip csvCell's formula guard only for the sign; they are generated here and quoted because of the comma.
    lines.push([...text, String(row.quantity), ...money.map((value) => `"${value}"`), ...dates].join(csvSeparator));
  }
  return csvBom + lines.join("\r\n") + "\r\n";
}
