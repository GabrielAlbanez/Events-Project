import { sendMail } from "./transport";
import { renderAccountEmail } from "./templates";

export async function sendVerificationEmail(email: string, verificationLink: string): Promise<void> {
  const { html, text } = renderAccountEmail({
    preheader: "Confirme seu e-mail para começar a usar o EventMap.",
    heading: "Confirme seu e-mail",
    paragraphs: [
      "Recebemos um pedido de cadastro no EventMap com este endereço.",
      "Para ativar sua conta, confirme o e-mail em até 24 horas.",
    ],
    action: { label: "Confirmar e-mail", url: verificationLink },
    note: "Se não foi você, ignore esta mensagem. Nenhuma conta será ativada sem a confirmação.",
  });
  await sendMail({ to: email, subject: "Confirme seu e-mail no EventMap", text, html });
}
