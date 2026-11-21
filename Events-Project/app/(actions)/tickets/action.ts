"use server";

import { getAuthenticatedAdminId, getAuthenticatedUser } from "@/lib/adminAuth";
import * as tickets from "@/lib/services/tickets";
import type { CreateTicketOrderInput, TicketOrderInput } from "@/schemas/tickets";

// Buying, connecting and refunding move money for the real account holder: impersonated sessions can only read.
const resolveAccountHolder = () => getAuthenticatedUser(undefined, { allowImpersonation: false });
const resolveViewer = () => getAuthenticatedUser();
const resolveAdmin = () => getAuthenticatedAdminId();

export async function getTicketPurchaseState(eventId: string) {
  return tickets.getTicketPurchaseState(eventId, resolveViewer);
}

export async function createTicketOrder(input: CreateTicketOrderInput) {
  return tickets.createTicketOrder(input, resolveAccountHolder);
}

export async function getTicketOrderStatus(input: TicketOrderInput) {
  return tickets.getTicketOrderStatus(input, resolveViewer);
}

export async function listMyTickets() {
  return tickets.listMyTickets(resolveViewer);
}

export async function getPaymentsOverview() {
  return tickets.getPaymentsOverview(resolveViewer);
}

export async function getTicketSellerStatus() {
  return tickets.getTicketSellerStatus(resolveViewer);
}

export async function startMercadoPagoConnect() {
  return tickets.startMercadoPagoConnect(resolveAccountHolder);
}

export async function disconnectMercadoPago() {
  return tickets.disconnectMercadoPago(resolveAccountHolder);
}

export async function refundTicketOrder(input: TicketOrderInput) {
  return tickets.refundTicketOrder(input, resolveAccountHolder);
}

export async function getAdminTicketOverview() {
  return tickets.getAdminTicketOverview(resolveAdmin);
}
