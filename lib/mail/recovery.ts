import nodemailer from "nodemailer";

export async function sendRecoveryEmail(email: string, link: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({
    from: process.env.EMAIL_USER, to: email, subject: "Redefina sua senha no EventMap",
    text: `Você solicitou uma nova senha. Abra ${link} em até 30 minutos. Se não foi você, ignore esta mensagem.`,
  });
}
