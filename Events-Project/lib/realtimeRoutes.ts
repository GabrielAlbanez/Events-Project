/** Conversation screens render their own realtime status in the chat header, so the global corner notice would repeat it. */
export function routeShowsOwnRealtimeStatus(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && /^\/eventos\/[^/]+\/(?:chat|conexoes\/[^/]+)$/.test(pathname);
}
