export type SessionSignal = 'session-expired' | 'account-removed' | 'account-suspended' | 'account-impersonated';
/** The API decides whether the original administrator is still authorized. */
export function signalAction(impersonating: boolean): 'restore' | 'clear' {
  return impersonating ? 'restore' : 'clear';
}
export function signalMessage(signal: SessionSignal): string {
  switch (signal) {
    case 'account-suspended': return 'Sua conta foi suspensa. Entre em contato com a administração.';
    case 'account-removed': return 'Esta conta não está mais disponível.';
    case 'account-impersonated': return 'Um administrador está acessando sua conta. Entre novamente após o encerramento desse acesso.';
    default: return 'Sua sessão foi encerrada. Entre novamente.';
  }
}
export function socketFailureSignal(code: unknown): SessionSignal | null {
  switch (code) {
    case 'ACCOUNT_SUSPENDED': return 'account-suspended';
    case 'ACCOUNT_REMOVED': return 'account-removed';
    case 'ACCOUNT_IMPERSONATED': return 'account-impersonated';
    case 'SESSION_REVOKED':
    case 'IMPERSONATION_CHANGED': return 'session-expired';
    default: return null;
  }
}
