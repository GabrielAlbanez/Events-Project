export function isAccountSuspended(user: { suspendedAt?: Date | null; suspendedUntil?: Date | null }, now = new Date()): boolean {
  return Boolean(user.suspendedAt && (!user.suspendedUntil || user.suspendedUntil > now));
}

export function accountSessionValid(version: unknown, currentVersion: number | undefined): boolean {
  return (typeof version === "number" ? version : 0) === (currentVersion ?? 0);
}
