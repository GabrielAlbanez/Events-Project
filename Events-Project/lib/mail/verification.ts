import nodemailer from "nodemailer";

export async function sendVerificationEmail(email: string, verificationLink: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Confirme seu e-mail no EventMap",
    text: `Confirme seu e-mail abrindo este link em até 24 horas: ${verificationLink}. Se não foi você, ignore esta mensagem.`,
  });
}
