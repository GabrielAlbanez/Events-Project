import { SVGProps } from "react";
import type { EventStatus } from "./features";

export type PublicPerson = { id: string; name: string | null; image: string | null };

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export type User = {
  suspendedAt?: string | null;
  suspendedUntil?: string | null;
  suspensionReason?: string | null;
  id: string;
  name: string;
  email: string;
  emailVerified: string | null;
  image: string;
  role: string;
  Events: Evento[]; // Ajuste conforme a estrutura dos eventos
};

export type Evento = {
  aiImport?: { sourceUrl: string; sourceVerifiedAt: Date | string } | null;
  nome: string;
  banner: string; // Banner principal
  carrossel: string[]; // Lista de URLs para imagens do carrossel
  descricao: string;
  organizerName?: string;
  ageRating?: string | null;
  accessibilityInfo?: string | null;
  participationInfo?: string | null;
  dataInicio: string; // 🔹 Alterado para data de início
  dataFim: string;
  user: PublicPerson | null;
  linkParaCompra: string;
  id: string;
  endereco: string;
  lat?: number | null;
  lng?: number | null;
  validate: boolean;
  /** Reviewer name; only loaded for the organizer's own event list, never in the public catalog. */
  validator?: Pick<PublicPerson, "name"> | null;
  userId?: string | null;
  status?: EventStatus;
  category?: string;
  isFree?: boolean;
  priceCents?: number;
  capacity?: number | null;
  /** EventMap ticket sales (Pix via Mercado Pago); only loaded where the organizer edits the event. */
  ticketsEnabled?: boolean;
  ticketCapacity?: number | null;
  /** Organizer approves each registration (EventMap-created events only); only loaded where the organizer edits the event. */
  requiresApproval?: boolean;
  /** Requests waiting for the organizer; only loaded in the organizer's own event list. */
  pendingRequests?: number;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string;
  reviewNote?: string | null;
  views?: number;
  ticketClicks?: number;
  favoriteCount?: number;
  /** Running paid highlight, computed on the server. Absent means not featured. */
  featured?: boolean;
};
