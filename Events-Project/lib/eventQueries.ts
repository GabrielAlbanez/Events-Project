import * as React from "react";
import { Prisma } from "@prisma/client";
import { Evento } from "@/types";
import prisma from "@/lib/prisma";
import { normalizeEventImages } from "@/lib/eventImageUrl";

// Every nested account field is explicitly public.
export const publicEventSelect = {
  id: true, nome: true, banner: true, carrossel: true, descricao: true,
  organizerName: true,
  dataInicio: true, dataFim: true, linkParaCompra: true, endereco: true,
  userId: true, validate: true, status: true, category: true, priceCents: true,
  isFree: true, lat: true, lng: true, startTime: true, endTime: true, timezone: true,
  capacity: true, ageRating: true, accessibilityInfo: true, participationInfo: true,
  validatedAt: true,
  aiImport: { select: { sourceUrl: true, sourceVerifiedAt: true } },
  user: { select: { id: true, name: true, image: true } },
  validator: { select: { id: true, name: true, image: true } },
} satisfies Prisma.EventsSelect;

/**
 * Lean projection for lists, cards and map pins (opt-in via `/api/AllEvents?view=card`).
 * Leaves out long text (descrição, carrossel, acessibilidade) and reviewer identity.
 */
export const publicEventCardSelect = {
  id: true, nome: true, banner: true, organizerName: true,
  dataInicio: true, dataFim: true, startTime: true, endTime: true, timezone: true,
  endereco: true, lat: true, lng: true, category: true, isFree: true, priceCents: true,
  status: true, validate: true, userId: true, linkParaCompra: true,
} satisfies Prisma.EventsSelect;

export type PublicEventRow = Prisma.EventsGetPayload<{ select: typeof publicEventSelect }>;
export type PublicEventCardRow = Prisma.EventsGetPayload<{ select: typeof publicEventCardSelect }>;
export type PublicEvent = Omit<PublicEventRow, "validate"> & { validate: boolean };
export type PublicEventCard = Omit<PublicEventCardRow, "validate"> & { validate: boolean };

/** Same fields as the stored row plus normalized artwork; `validate` is never null for clients. */
export function toPublicEvent(event: PublicEventRow): PublicEvent {
  return { ...normalizeEventImages(event), validate: event.validate ?? false };
}

export function toPublicEventCard(event: PublicEventCardRow): PublicEventCard {
  return { ...normalizeEventImages(event), validate: event.validate ?? false };
}

const catalogOrder: Prisma.EventsOrderByWithRelationInput[] = [{ dataInicio: "asc" }, { id: "asc" }];

/** Default public catalog: every published event, earliest start first (unchanged contract). */
export async function listPublicCatalog(take?: number): Promise<PublicEvent[]> {
  const events = await prisma.events.findMany({
    where: { status: "PUBLISHED" }, select: publicEventSelect, orderBy: catalogOrder,
    ...(take ? { take } : {}),
  });
  return events.map(toPublicEvent);
}

export type CatalogPageOptions = {
  limit: number;
  cursor?: string;
  /** YYYY-MM-DD: keep events that end on or after this day. */
  from?: string;
  view: "full" | "card";
};

export type CatalogPage<T> = { events: T[]; nextCursor: string | null };

function pageQuery(options: CatalogPageOptions) {
  const where: Prisma.EventsWhereInput = { status: "PUBLISHED", ...(options.from ? { dataFim: { gte: options.from } } : {}) };
  return {
    where, orderBy: catalogOrder, take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  };
}

function toPage<T extends { id: string }>(rows: T[], limit: number): CatalogPage<T> {
  const events = rows.slice(0, limit);
  return { events, nextCursor: rows.length > limit ? events[events.length - 1]?.id ?? null : null };
}

/** Opt-in, cursor-paginated catalog with a stable (dataInicio, id) order. */
export async function listPublicCatalogPage(options: CatalogPageOptions): Promise<CatalogPage<PublicEvent> | CatalogPage<PublicEventCard>> {
  if (options.view === "card") {
    const rows = await prisma.events.findMany({ ...pageQuery(options), select: publicEventCardSelect });
    return toPage(rows.map(toPublicEventCard), options.limit);
  }
  const rows = await prisma.events.findMany({ ...pageQuery(options), select: publicEventSelect });
  return toPage(rows.map(toPublicEvent), options.limit);
}

type AsyncLookup<A extends unknown[], R> = (...args: A) => Promise<R>;

// React.cache deduplicates the lookup between generateMetadata and the page in one request.
// Outside the React server runtime (offline verify loaders, scripts) it may be missing: run uncached.
function requestDedupe<A extends unknown[], R>(fn: AsyncLookup<A, R>): AsyncLookup<A, R> {
  const reactCache: unknown = (React as { cache?: unknown }).cache;
  return typeof reactCache === "function" ? (reactCache as (f: AsyncLookup<A, R>) => AsyncLookup<A, R>)(fn) : fn;
}

export const getPublicEvent = requestDedupe(async (id: string): Promise<Evento | null> => {
  const event = await prisma.events.findFirst({
    where: { id, status: { in: ["PUBLISHED", "CANCELLED", "ENDED"] } },
    select: publicEventSelect,
  });
  return event ? toPublicEvent(event) : null;
});
