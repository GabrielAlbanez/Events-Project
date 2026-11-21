import { sendMail } from "./transport";
import { renderAccountEmail } from "./templates";

/**
 * Sent when someone tries to register an e-mail that already has an account. The
 * registration endpoint answers the same way in both cases, so the owner learns about
 * the attempt here instead of the requester learning that the account exists.
 */
export async function sendAccountExistsEmail(email: string, links: { login: string; recovery: string }): Promise<void> {
  const { html, text } = renderAccountEmail({
    preheader: "Já existe uma conta EventMap com este e-mail.",
    heading: "Você já tem uma conta",
    paragraphs: [
      "Alguém tentou criar uma conta no EventMap com este e-mail, mas ele já está cadastrado.",
      "Se foi você, entre com sua senha ou com o Google. Se esqueceu a senha, crie uma nova pelo link de recuperação.",
      `Recuperar senha: ${links.recovery}`,
    ],
    action: { label: "Entrar no EventMap", url: links.login },
    note: "Se não foi você, ignore esta mensagem. Nenhuma alteração foi feita na sua conta.",
  });
  await sendMail({ to: email, subject: "Tentativa de cadastro no EventMap", text, html });
}
