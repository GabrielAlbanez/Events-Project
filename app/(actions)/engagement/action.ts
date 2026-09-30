"use server";

import { getAuthenticatedUser } from "@/lib/adminAuth";
import type { Evento } from "@/types";
import type { NotificationDTO } from "@/types/features";
import * as favorites from "@/lib/services/favorites";
import * as notifications from "@/lib/services/notifications";
import * as promoters from "@/lib/services/promoters";

export async function getSavedEvents(): Promise<Evento[]> {
  return favorites.getSavedEvents(getAuthenticatedUser);
}

export async function getFavoriteState(eventId:string) {
  return favorites.getFavoriteState(eventId, getAuthenticatedUser);
}

export async function toggleFavorite(eventId:string) {
  return favorites.toggleFavorite(eventId, getAuthenticatedUser);
}

export async function setEventReminder(eventId:string, minutes:number|null) {
  return favorites.setEventReminder(eventId, minutes, getAuthenticatedUser);
}

export async function getNotifications(): Promise<NotificationDTO[]> {
  return notifications.getNotifications(getAuthenticatedUser);
}

export async function markNotificationRead(id:string|null) {
  return notifications.markNotificationRead(id, getAuthenticatedUser);
}

export async function getPromoterProfile(id:string) {
  return promoters.getPromoterProfile(id, getAuthenticatedUser);
}

export async function toggleFollow(promoterId:string) {
  return promoters.toggleFollow(promoterId, getAuthenticatedUser);
}

export async function getMyPublicProfile() {
  return promoters.getMyPublicProfile(getAuthenticatedUser);
}

export async function updatePromoterProfile(input:{bio:string;contactUrl:string}) {
  return promoters.updatePromoterProfile(input, getAuthenticatedUser);
}

export async function getPromoterStats() {
  return promoters.getPromoterStats(getAuthenticatedUser);
}
