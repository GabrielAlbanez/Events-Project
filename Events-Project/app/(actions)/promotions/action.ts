"use server";

import { getAuthenticatedAdminId, getAuthenticatedUser } from "@/lib/adminAuth";
import * as promotions from "@/lib/services/promotions";
import type { CancelPromotionInput, CreatePromotionInput, MarkPromotionPaidInput, ReviewPromotionInput } from "@/schemas/promotions";

// Payment orders speak for the real account holder, so impersonated sessions can only read them.
const resolveAccountHolder = () => getAuthenticatedUser(undefined, { allowImpersonation: false });
const resolveViewer = () => getAuthenticatedUser();
const resolveAdmin = () => getAuthenticatedAdminId();

export async function getPromotionOverview(eventId: string) {
  return promotions.getPromotionOverview(eventId, resolveViewer);
}

export async function createPromotionOrder(input: CreatePromotionInput) {
  return promotions.createPromotionOrder(input, resolveAccountHolder);
}

export async function markPromotionPaid(input: MarkPromotionPaidInput) {
  return promotions.markPromotionPaid(input, resolveAccountHolder);
}

export async function cancelPromotionOrder(input: CancelPromotionInput) {
  return promotions.cancelPromotionOrder(input, resolveAccountHolder);
}

export async function listPromotionReview() {
  return promotions.listPromotionReview(resolveAdmin);
}

export async function reviewPromotion(input: ReviewPromotionInput) {
  return promotions.reviewPromotion(input, resolveAdmin);
}

/** Reminder on Meus eventos: the real account holder's own unpaid orders only. */
export async function listMyPendingPromotions() {
  return promotions.listMyPendingPromotions(resolveAccountHolder);
}
