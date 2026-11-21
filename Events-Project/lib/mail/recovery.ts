import { sendMail } from "./transport";
import { renderAccountEmail } from "./templates";

export async function sendRecoveryEmail(email: string, link: string): Promise<void> {
  const { html, text } = renderAccountEmail({
    preheader: "Use o link em até 30 minutos para criar uma nova senha.",
    heading: "Redefina sua senha",
    paragraphs: [
      "Você pediu uma nova senha para sua conta no EventMap.",
      "O link vale por 30 minutos e só pode ser usado uma vez. Ao trocar a senha, as outras sessões abertas serão encerradas.",
    ],
    action: { label: "Criar nova senha", url: link },
    note: "Se não foi você, ignore esta mensagem. Sua senha atual continua valendo.",
  });
  await sendMail({ to: email, subject: "Redefina sua senha no EventMap", text, html });
}
