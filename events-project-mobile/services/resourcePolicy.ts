/** Authorization failures must not leave private content cached on screen. */
export function isAccessFailure(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'status' in error &&
    typeof error.status === 'number' && [401, 403, 404, 409].includes(error.status));
}
export function isDomainUpdate(value: unknown): value is { room: string } {
  return Boolean(value && typeof value === 'object' && 'room' in value && typeof value.room === 'string');
}
