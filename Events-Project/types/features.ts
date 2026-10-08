export type EventStatus = "DRAFT" | "PENDING" | "CHANGES_REQUESTED" | "PUBLISHED" | "CANCELLED" | "ENDED";
export type EventHistoryAction = "CREATED" | "VALIDATED" | "DELETED" | "UPDATED" | "CHANGES_REQUESTED" | "CANCELLED" | "SUBMITTED" | "DUPLICATED";
export const eventStatusLabels: Record<EventStatus, string> = { DRAFT: "Rascunho", PENDING: "Em análise", CHANGES_REQUESTED: "Correção solicitada", PUBLISHED: "Publicado", CANCELLED: "Cancelado", ENDED: "Encerrado" };
export const eventCategories = ["Música", "Esportes", "Gastronomia", "Cultura", "Educação", "Tecnologia", "Outros"] as const;
export type NotificationDTO = { id: string; title: string; message: string; href: string; readAt: string | null; createdAt: string };
