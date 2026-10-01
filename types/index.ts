import { SVGProps } from "react";
import type { EventStatus } from "./features";

export type PublicPerson = { id: string; name: string | null; image: string | null };

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: string | null;
  image: string;
  role: string;
  Events: Evento[]; // Ajuste conforme a estrutura dos eventos
};

export type Evento = {
  nome: string;
  banner: string; // Banner principal
  carrossel: string[]; // Lista de URLs para imagens do carrossel
  descricao: string;
  dataInicio: string; // 🔹 Alterado para data de início
  dataFim: string;
  user: PublicPerson | null;
  linkParaCompra: string;
  id: string;
  endereco: string;
  lat?: number | null;
  lng?: number | null;
  validate: boolean;
  validator: PublicPerson | null;
  userId?: string | null;
  status?: EventStatus;
  category?: string;
  isFree?: boolean;
  priceCents?: number;
  capacity?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string;
  reviewNote?: string | null;
  views?: number;
  ticketClicks?: number;
  favoriteCount?: number;
};
