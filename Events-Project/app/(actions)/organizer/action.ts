"use server";

import { getAuthenticatedUser } from "@/lib/adminAuth";
import * as organizer from "@/lib/organizer/service";
import type { EventClaimInput, OrganizerActionResult, OrganizerActivationInput, OrganizerRequestInput, TransferOwnershipInput } from "@/lib/organizer/schema";

// Requests speak for the real account holder, so impersonated sessions cannot send them.
const resolveAccountHolder = () => getAuthenticatedUser(undefined, { allowImpersonation: false });

export async function requestOrganizerAccess(input: OrganizerRequestInput): Promise<OrganizerActionResult> {
  return organizer.submitOrganizerRequest(input, resolveAccountHolder);
}

export async function activateOrganizerAccess(input: OrganizerActivationInput): Promise<OrganizerActionResult> {
  return organizer.activateOrganizer(input, resolveAccountHolder);
}

export async function claimEventOwnership(input: EventClaimInput): Promise<OrganizerActionResult> {
  return organizer.submitEventClaim(input, resolveAccountHolder);
}

export async function transferEventOwnership(eventId: TransferOwnershipInput["eventId"], newOwnerEmail: TransferOwnershipInput["newOwnerEmail"]): Promise<OrganizerActionResult> {
  return organizer.transferEventOwnership({ eventId, newOwnerEmail }, resolveAccountHolder);
}
