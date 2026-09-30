"use server";

import { getAuthenticatedUser } from "@/lib/adminAuth";
import * as events from "@/lib/services/events";
import type { Evento } from "@/types";

export async function salvarEvento(formData: FormData, userId: string) {
  return events.salvarEvento(formData, userId, getAuthenticatedUser);
}

export async function salvarRascunho(formData: FormData, userId: string) {
  return events.salvarRascunho(formData, userId, getAuthenticatedUser);
}

export async function atualizarEvento(eventId: string, formData: FormData, submit: boolean) {
  return events.atualizarEvento(eventId, formData, submit, getAuthenticatedUser);
}

export async function getOwnedEvent(id: string): Promise<Evento | null> {
  return events.getOwnedEvent(id, getAuthenticatedUser);
}

export async function duplicarEvento(eventId: string) {
  return events.duplicarEvento(eventId, getAuthenticatedUser);
}

export async function cancelarEvento(eventId: string) {
  return events.cancelarEvento(eventId, getAuthenticatedUser);
}

export async function solicitarCorrecao(eventId: string, reason: string) {
  return events.solicitarCorrecao(eventId, reason, getAuthenticatedUser);
}
