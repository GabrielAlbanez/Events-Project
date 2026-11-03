export type PartyIntent = "FRIENDSHIP" | "COMPANY" | "DATING";
export interface PartyPublicProfile { userId: string; displayName: string; photoUrl: string; bio: string; interests: string[]; intent: PartyIntent; liked: boolean }
export type PartyDiscoveryProfile = PartyPublicProfile;
export interface PartyReportsSnapshot { reports: { id: string; eventId: string; reason: string; evidence: string | null; status: string; createdAt: string }[] }
export interface PartyOwnProfile { displayName: string; photoUrl: string; bio: string; interests: string[]; intent: PartyIntent; adultDeclared: boolean; active: boolean }
export type PartySavedProfile = Omit<PartyOwnProfile, "active">;
export interface PartySavedProfileSnapshot { profile: PartySavedProfile | null; needsReview: boolean }
export interface PartyConnectionsSnapshot {
  savedProfile: PartySavedProfile | null;
  profileNeedsReview: boolean;
  event: { id: string; name: string };
  eligible: boolean;
  mine: PartyOwnProfile | null;
  profiles: PartyPublicProfile[];
  nextAfter: string | null;
  matches: { id: string; profile: PartyPublicProfile; unreadCount?: number; createdAt?: string; lastMessage?: { text: string; createdAt: string; own: boolean } }[];
  blocks: { userId: string; displayName: string }[];
}
