import { AsyncLocalStorage } from 'node:async_hooks';
const scope = new AsyncLocalStorage<Headers>();
export function withRequestHeaders<T>(requestHeaders: Headers, execute: () => Promise<T>): Promise<T> {
  return scope.run(requestHeaders, execute);
}
/** Only used by the explicitly registered legacy admin actions. */
export function headers(): Headers {
  const current = scope.getStore();
  if (!current) throw new Error('Request scope unavailable');
  return current;
}
