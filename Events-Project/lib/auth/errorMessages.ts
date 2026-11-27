/**
 * Client-safe catalogue of authentication error codes and their pt-BR messages.
 *
 * NextAuth forwards codes through `signIn().error` and the `?error=` query string of
 * /login. Only codes listed here are ever shown; any other value (including raw
 * exception text or `CredentialsSignin` itself) falls back to a generic message.
 */
export type CredentialsErrorCode = "CredentialsSignin" | "EmailNotVerified" | "AccountSuspended" | "RateLimited" | "ServiceUnavailable";

export const credentialsErrorMessages: Record<CredentialsErrorCode, string> = {
  CredentialsSignin: "E-mail ou senha incorretos. Se você criou a conta com o Google, use o botão do Google.",
  EmailNotVerified: "Confirme seu e-mail antes de entrar. Você pode reenviar o link de confirmação.",
  AccountSuspended: "Sua conta está suspensa. Entre em contato com a administração.",
  RateLimited: "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
  ServiceUnavailable: "Não foi possível entrar agora. Tente novamente em instantes.",
};

const oauthErrorMessages: Record<string, string> = {
  OAuthAccountNotLinked: "Este e-mail já está vinculado a outra forma de acesso. Entre com o método usado no cadastro.",
  AccessDenied: "O acesso não foi permitido. Se sua conta estiver suspensa, entre em contato com a administração.",
  OAuthSignin: "Não foi possível iniciar o login com o Google. Tente novamente.",
  OAuthCallback: "O login com o Google não foi concluído. Tente novamente.",
  OAuthCreateAccount: "Não foi possível criar sua conta com o Google. Tente novamente.",
  Callback: "O login não foi concluído. Tente novamente.",
  SessionRequired: "Entre na sua conta para continuar.",
  Configuration: "O login está temporariamente indisponível. Tente novamente mais tarde.",
  Verification: "O link de acesso expirou ou já foi usado.",
};

export const GENERIC_LOGIN_ERROR = "Não foi possível entrar. Verifique os dados e tente novamente.";

export function isCredentialsErrorCode(value: unknown): value is CredentialsErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(credentialsErrorMessages, value);
}

/** Maps a NextAuth error code to a friendly message. Unknown values never leak to the UI. */
export function loginErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  if (isCredentialsErrorCode(code)) return credentialsErrorMessages[code];
  if (Object.prototype.hasOwnProperty.call(oauthErrorMessages, code)) return oauthErrorMessages[code];
  return GENERIC_LOGIN_ERROR;
}
