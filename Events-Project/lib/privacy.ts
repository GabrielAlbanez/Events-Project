/** Public contact details only. Never reuse SMTP credentials as a contact fallback. */
const controllerName = process.env.PRIVACY_CONTROLLER_NAME?.trim() || "Gabriel Albanez";
const email = process.env.PRIVACY_CONTACT_EMAIL?.trim() || "gabriel.g.albanez@gmail.com";
const contactEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !/[\r\n]/.test(email) ? email : null;

export const privacyConfig = {
  controllerName,
  contactEmail,
  updatedAt: "9 de novembro de 2026",
} as const;

export const privacyReady = Boolean(controllerName && contactEmail);
