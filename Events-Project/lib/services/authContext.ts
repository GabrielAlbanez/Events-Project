export interface AuthenticatedUser {
  id: string;
  role: string;
}

/** Supplied by the action or API; application services do not read request headers. */
export type ResolveCurrentUser = () => Promise<AuthenticatedUser | null>;

export type ResolveAdminId = () => Promise<string | null>;
