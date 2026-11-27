import nodemailer from "nodemailer";

/**
 * Best-effort copy of an organizer request for admins. Notifications are limited to 160
 * characters, so the e-mail carries the full text when the existing mail credentials exist.
 */
export function organizerMailConfigured(): boolean {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

export async function sendOrganizerMail(recipients: string[], subject: string, text: string): Promise<boolean> {
  if (!organizerMailConfigured() || recipients.length === 0) return false;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({ from: process.env.EMAIL_USER, bcc: recipients, subject: subject.replace(/[\r\n]+/g, " ").slice(0, 150), text });
  return true;
}
