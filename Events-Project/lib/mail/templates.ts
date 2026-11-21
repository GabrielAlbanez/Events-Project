/**
 * Branded transactional e-mail layout (pt-BR) with a plain-text alternative.
 * Inline styles and tables keep it readable in Gmail, Outlook and Apple Mail; the
 * action link is also printed as text for clients that block buttons.
 */
export type AccountEmailContent = {
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  note?: string;
};

const BRAND = "#3655FF";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeActionUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("UNSAFE_MAIL_LINK");
  return parsed.href;
}

export function renderAccountEmail(content: AccountEmailContent): { html: string; text: string } {
  const action = content.action ? { label: content.action.label, url: safeActionUrl(content.action.url) } : null;
  const paragraphs = content.paragraphs.map(text => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">${escapeHtml(text)}</p>`).join("");
  const button = action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px;"><tr><td style="border-radius:10px;background:${BRAND};"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(action.label)}</a></td></tr></table>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#475569;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;word-break:break-all;"><a href="${escapeHtml(action.url)}" style="color:${BRAND};">${escapeHtml(action.url)}</a></p>`
    : "";
  const note = content.note ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">${escapeHtml(content.note)}</p>` : "";
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5fb;font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f5fb;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;"><span style="color:${BRAND};">●</span> EventMap</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 28px;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">${escapeHtml(content.heading)}</h1>
${paragraphs}${button}${note}
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.6;color:#64748b;">Mensagem automática do EventMap. Não responda a este e-mail.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    content.heading,
    "",
    ...content.paragraphs.flatMap(paragraph => [paragraph, ""]),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    ...(content.note ? [content.note, ""] : []),
    "Mensagem automática do EventMap. Não responda a este e-mail.",
  ].join("\n");
  return { html, text };
}
