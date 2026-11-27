/**
 * Fixed, free and instant checks for a submitted event. Pure: no database, no network.
 * "fix" findings go back to the organizer; "serious" findings go to an admin.
 */
export type FindingSeverity = "fix" | "serious";
export interface Finding { code: string; severity: FindingSeverity; message: string }
export interface ImageSize { width: number; height: number }
export interface TriageEventInput {
  nome: string; descricao: string; category: string; dataInicio: string; dataFim: string; endereco: string;
  lat: number | null; lng: number | null; isFree: boolean; priceCents: number; ticketsEnabled: boolean; linkParaCompra: string;
}
export interface RuleContext { now: Date; image: ImageSize | null; duplicateImage: boolean }

export const MIN_DESCRIPTION_CHARS = 60;
export const MIN_IMAGE_WIDTH = 600;
export const MIN_IMAGE_HEIGHT = 300;
export const MAX_IMAGE_RATIO = 4;
/** R$ 2.000,00: above this a price is unusual enough for a human look. */
export const HIGH_PRICE_CENTS = 200000;

/** Reads width/height from PNG, JPEG or WebP headers. Returns null for anything else. */
export function imageDimensions(bytes: Buffer): ImageSize | null {
  try {
    if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.toString("ascii", 12, 16) === "IHDR") {
      return valid(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
    }
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const marker = bytes[offset + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
        const length = bytes.readUInt16BE(offset + 2);
        // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return valid(bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5));
        }
        offset += 2 + length;
      }
      return null;
    }
    if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
      const chunk = bytes.toString("ascii", 12, 16);
      if (chunk === "VP8X") return valid(1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3));
      if (chunk === "VP8 ") return valid(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff);
      if (chunk === "VP8L") {
        const bits = bytes.readUInt32LE(21);
        return valid((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
      }
    }
  } catch {
    return null;
  }
  return null;
}
function valid(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Payment outside the platform is the most common scam pattern for event tickets. */
const offPlatformPayment = [/pix direto/, /chave pix/, /(whats ?app|zap|wpp|direct|dm|inbox)\b[^.]{0,40}\b(pag|compr|pix|deposit|transfer)/, /\b(pag|compr|deposit|transfer)\w*\b[^.]{0,40}\b(whats ?app|zap|wpp|direct|dm|inbox)\b/, /deposit[oa] (antecipad|na conta)/];
const adultContent = [/\bnudes?\b/, /\bnud[ea]z\b/, /\bputaria\b/, /\bsexo explicito\b/, /\bonlyfans\b/, /\bprivacy\b.{0,20}\b(link|conteudo)\b/, /\bgarotas? de programa\b/, /\bacompanhantes?\b/];

function todayInSaoPaulo(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function eventRuleFindings(event: TriageEventInput, context: RuleContext): Finding[] {
  const findings: Finding[] = [];
  const add = (code: string, severity: FindingSeverity, message: string) => findings.push({ code, severity, message });
  const end = event.dataFim || event.dataInicio;
  if (end && end < todayInSaoPaulo(context.now)) add("past-date", "fix", "A data do evento já passou. Confira a data de início e de término.");
  if (typeof event.lat !== "number" || typeof event.lng !== "number") add("no-location", "fix", "O endereço não foi encontrado no mapa. Escolha o local pela busca de endereço.");
  if (event.descricao.trim().length < MIN_DESCRIPTION_CHARS) add("short-description", "fix", `A descrição está muito curta. Conte em pelo menos ${MIN_DESCRIPTION_CHARS} caracteres o que vai acontecer no evento.`);
  if (!context.image) {
    add("image-unreadable", "serious", "Não foi possível conferir a imagem de capa automaticamente.");
  } else {
    const { width, height } = context.image;
    if (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT) add("small-image", "fix", `A imagem de capa está pequena (${width}×${height}). Use uma imagem de pelo menos ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT} pixels.`);
    else if (Math.max(width, height) / Math.min(width, height) > MAX_IMAGE_RATIO) add("stretched-image", "fix", "A imagem de capa está muito estreita ou comprida. Use uma imagem mais próxima do formato horizontal (ex.: 1200×630).");
  }
  if (context.duplicateImage) add("duplicate-image", "serious", "A imagem de capa já é usada em outro evento de outro organizador.");
  if (!event.isFree && event.priceCents > HIGH_PRICE_CENTS) add("high-price", "serious", "O preço do ingresso está acima do comum e precisa de uma conferência da equipe.");
  const text = normalize([event.nome, event.descricao, event.linkParaCompra].join(" \n "));
  if (offPlatformPayment.some(pattern => pattern.test(text))) add("off-platform-payment", "serious", "O texto pede pagamento fora do EventMap (Pix direto ou WhatsApp), um padrão comum de golpe.");
  if (adultContent.some(pattern => pattern.test(text)) || /\+ ?18\b.{0,30}\b(nude|sexo|putaria)/.test(text) || /\b(nude|sexo|putaria)\b.{0,30}\+ ?18/.test(text)) add("adult-content", "serious", "O texto indica conteúdo adulto, que precisa de análise da equipe.");
  return findings;
}
