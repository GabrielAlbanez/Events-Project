import type { ReactNode } from "react";
import { Ban, BadgeCheck, CheckCircle2, CircleDashed, CircleSlash, Clock3, FilePen, Flag, Hourglass, TicketCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { eventStatusLabels, type EventStatus } from "@/types/features";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
/** PENDING/APPROVED/REJECTED: requests on events where the organizer approves each participant. */
export type RegistrationStatus = "CONFIRMED" | "WAITLISTED" | "CHECKED_IN" | "CANCELLED" | "PENDING" | "APPROVED" | "REJECTED";

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-primary/25 bg-primary/10 text-brand",
  success: "border-emerald-600/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  warning: "border-amber-600/25 bg-amber-500/10 text-amber-900 dark:text-amber-300",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

export const eventStatusTone: Record<EventStatus, { tone: StatusTone; icon: LucideIcon }> = {
  DRAFT: { tone: "neutral", icon: FilePen },
  PENDING: { tone: "info", icon: Hourglass },
  CHANGES_REQUESTED: { tone: "warning", icon: Flag },
  PUBLISHED: { tone: "success", icon: CheckCircle2 },
  CANCELLED: { tone: "danger", icon: Ban },
  ENDED: { tone: "neutral", icon: CircleDashed },
};

export const registrationStatusLabels: Record<RegistrationStatus, string> = {
  CONFIRMED: "Presença confirmada",
  WAITLISTED: "Lista de espera",
  CHECKED_IN: "Entrada registrada",
  CANCELLED: "Inscrição cancelada",
  PENDING: "Aguardando aprovação",
  APPROVED: "Aprovado · falta o ingresso",
  REJECTED: "Participação não aprovada",
};

export const registrationStatusTone: Record<RegistrationStatus, { tone: StatusTone; icon: LucideIcon }> = {
  CONFIRMED: { tone: "success", icon: TicketCheck },
  WAITLISTED: { tone: "warning", icon: Clock3 },
  CHECKED_IN: { tone: "info", icon: CheckCircle2 },
  CANCELLED: { tone: "neutral", icon: Ban },
  PENDING: { tone: "warning", icon: Hourglass },
  APPROVED: { tone: "info", icon: BadgeCheck },
  REJECTED: { tone: "neutral", icon: CircleSlash },
};

type StatusBadgeProps = {
  tone?: StatusTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
};

/** Status chip that always pairs color with an icon and text, never color alone. */
export function StatusBadge({ tone = "neutral", icon: Icon, children, className }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none", toneClasses[tone], className)}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

export function EventStatusBadge({ status, className }: { status: EventStatus; className?: string }) {
  const { tone, icon } = eventStatusTone[status];
  return <StatusBadge tone={tone} icon={icon} className={className}>{eventStatusLabels[status]}</StatusBadge>;
}

export function RegistrationStatusBadge({ status, className }: { status: RegistrationStatus; className?: string }) {
  const { tone, icon } = registrationStatusTone[status];
  return <StatusBadge tone={tone} icon={icon} className={className}>{registrationStatusLabels[status]}</StatusBadge>;
}
