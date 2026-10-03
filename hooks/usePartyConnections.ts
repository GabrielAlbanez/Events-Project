"use client";

import { useCallback, useEffect, useState } from "react";
import { useCommunityResource } from "@/components/MyComponents/CommunityResource";
import type { PartyConnectionsSnapshot } from "@/types/partyConnections";

export function usePartyConnections(eventId: string) {
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const cursor = pages[pages.length - 1];
  const resource = useCommunityResource<PartyConnectionsSnapshot>(`/api/party-connections/${encodeURIComponent(eventId)}${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`);
  const [revoked, setRevoked] = useState(false);
  const revoke = useCallback(() => { setRevoked(true); void resource.refresh(); }, [resource.refresh]);
  useEffect(() => { if (resource.data) setRevoked(false); }, [resource.revision, resource.data]);
  const data = resource.data && revoked ? { ...resource.data, profiles: [], matches: [] } : resource.data;
  return { ...resource, data, revoked, revoke, hasPrevious: pages.length > 1, next: () => { if (data?.nextAfter) setPages(previous => [...previous, data.nextAfter]); }, previous: () => setPages(previous => previous.length > 1 ? previous.slice(0, -1) : previous) };
}
