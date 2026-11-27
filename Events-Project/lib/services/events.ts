import { Evento } from "@/types";
import prisma from "@/lib/prisma";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import { eventUpdateNotice, sensitiveEventChanges, sensitiveFieldLabels } from "@/lib/eventScheduleChanges";
import { reconcileEventWaitlist } from "@/lib/services/attendance";
import { notifyEventAudience } from "@/lib/eventNotifications";
import { publicEventSelect } from "@/lib/eventQueries";
import { parseEventInput, parseTicketSettings } from "@/schemas/eventInput";
import { ticketSettingsProblem } from "@/lib/services/tickets";
import { Prisma, EventHistoryAction } from "@prisma/client";
import { saveEventImage, removeEventImages } from "@/lib/storage/eventImages";
import { uploadMultipartFits, uploadMultipartLimitMessage } from "@/lib/uploadLimits";
async function actor(resolveCurrentUser: ResolveCurrentUser) {
    const user = await resolveCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "PROMOTER"))
        return null;
    return prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, name: true } });
}
async function record(transaction: Prisma.TransactionClient, event: {
    id: string;
    nome: string;
    userId: string | null;
}, user: {
    id: string;
    name: string | null;
}, action: EventHistoryAction, note?: string) {
    await transaction.eventHistory.create({ data: { eventId: event.id, eventName: event.nome, promoterId: event.userId, actorId: user.id, actorName: user.name, action, note } });
}
async function save(formData: FormData, userId: string | null, eventId: string | null, submit: boolean, resolveCurrentUser: ResolveCurrentUser) {
    const savedFiles: string[] = [];
    try {
        const user = await actor(resolveCurrentUser);
        if (!user || (userId && user.id !== userId))
            return { success: false, message: "Acesso negado." };
        if (!uploadMultipartFits(formData))
            return { success: false, message: uploadMultipartLimitMessage };
        const existing = eventId ? await prisma.events.findUnique({ where: { id: eventId } }) : null;
        if (eventId && (!existing || (existing.userId !== user.id && user.role !== "ADMIN")))
            return { success: false, message: "Evento não encontrado ou acesso negado." };
        if (existing?.status === "CANCELLED" || existing?.status === "ENDED")
            return { success: false, message: "Este evento já foi encerrado. Duplique-o para criar uma nova edição." };
        // A published event may stay online after the edit, so it must keep meeting the submission rules
        // even when a client sends submit=false (server actions accept any argument).
        const parsed = parseEventInput(formData, submit || existing?.status === "PUBLISHED");
        if (!parsed.success)
            return parsed;
        // Ticket sales: older clients omit the fields and keep the stored settings; enabling is always re-checked here.
        const ticketInput = parseTicketSettings(formData);
        if (ticketInput && !ticketInput.success)
            return ticketInput;
        const ticketSettings = ticketInput?.data ?? { ticketsEnabled: existing?.ticketsEnabled ?? false, ticketCapacity: existing?.ticketCapacity ?? null };
        const ticketProblem = await ticketSettingsProblem(prisma, existing?.userId ?? user.id, { ticketsEnabled: ticketSettings.ticketsEnabled, isFree: parsed.data.isFree, priceCents: parsed.data.priceCents, alreadyEnabled: Boolean(existing?.ticketsEnabled) });
        if (ticketProblem)
            return { success: false, message: ticketProblem };
        // Approval of registrations: new events start with it on; older clients omit the field and keep the stored value.
        const approvalField = formData.get("requiresApproval");
        const requiresApproval = approvalField === null ? existing?.requiresApproval ?? true : approvalField === "true" || approvalField === "on";
        const bannerFile = formData.get("banner");
        let banner = existing?.banner ?? "";
        if (bannerFile instanceof File && bannerFile.size) {
            banner = await saveEventImage(bannerFile);
            savedFiles.push(banner);
        }
        if (submit && !banner)
            return { success: false, message: "Adicione uma imagem de capa antes de enviar." };
        const files = formData.getAll("carrossel").filter((item): item is File => item instanceof File && item.size > 0);
        if (files.length > 10)
            throw new Error("Adicione no máximo 10 imagens.");
        const carrossel = files.length ? await Promise.all(files.map(async (file) => { const url = await saveEventImage(file); savedFiles.push(url); return url; })) : existing?.carrossel ?? [];
        const wasPublished = existing?.status === "PUBLISHED";
        // OPP-01: only sensitive changes take a published event back to review.
        // A new cover is shown everywhere the event appears, so it is reviewed like the name.
        const sensitive = existing && wasPublished
            ? [...sensitiveEventChanges(existing, { ...parsed.data, organizerName: formData.has("organizerName") ? parsed.data.organizerName : undefined }), ...(banner !== existing.banner ? [sensitiveFieldLabels.banner] : [])]
            : [];
        const liveUpdate = wasPublished && sensitive.length === 0;
        const status = liveUpdate ? "PUBLISHED" as const : submit || wasPublished ? "PENDING" as const : "DRAFT" as const;
        const capacityGrew = liveUpdate && existing !== null && existing.capacity !== null && (parsed.data.capacity === null || parsed.data.capacity > existing.capacity);
        const evento = await prisma.$transaction(async (transaction) => {
            const reviewReset = liveUpdate ? {} : { validate: false, validatedAt: null, validatedBy: null, reviewNote: null };
            const data = { ...parsed.data, ...ticketSettings, requiresApproval, banner, carrossel, status, ...reviewReset };
            // Older clients omit these fields: preserve existing information until explicitly edited.
            if (existing) {
                if (!formData.has("organizerName")) data.organizerName = existing.organizerName;
                if (!formData.has("ageRating")) data.ageRating = existing.ageRating;
                if (!formData.has("accessibilityInfo")) data.accessibilityInfo = existing.accessibilityInfo;
                if (!formData.has("participationInfo")) data.participationInfo = existing.participationInfo;
            }
            if (existing) {
                const changed = await transaction.events.updateMany({ where: { id: existing.id, updatedAt: existing.updatedAt, status: existing.status }, data });
                if (!changed.count)
                    throw new Error("CONCURRENT_EVENT_CHANGE");
            }
            const event = existing ? await transaction.events.findUniqueOrThrow({ where: { id: existing.id } }) : await transaction.events.create({ data: { ...data, userId: user.id } });
            if (liveUpdate) {
                await record(transaction, event, user, "UPDATED", "Alterações publicadas sem nova revisão (campos não sensíveis).");
                await notifyEventAudience(transaction, event, { title: "Evento atualizado", message: event.nome + ": alterações publicadas sem sair do ar.", includeAdmins: true, includeFavorites: false });
                return event;
            }
            await record(transaction, event, user, existing ? status === "PENDING" ? "SUBMITTED" : "UPDATED" : "CREATED", sensitive.length ? "Nova revisão por alteração de: " + sensitive.join(", ") + "." : undefined);
            if (status === "PENDING")
                await notifyEventAudience(transaction, event, { title: "Evento em revisão", message: "O evento foi enviado para análise.", includeAdmins: true });
            if (wasPublished && existing) {
                await notifyEventAudience(transaction, event, { ...eventUpdateNotice(existing, parsed.data), includeFavorites: true, includeRegistrations: true });
                await transaction.favorite.updateMany({ where: { eventId: event.id }, data: { reminderSentAt: null } });
            }
            return event;
        });
        if (capacityGrew) {
            try {
                await reconcileEventWaitlist(evento.id);
            }
            catch {
                console.error("Waitlist reconciliation failed after an event update.");
            }
        }
        return { success: true, message: liveUpdate ? "Alterações publicadas. O evento continua no ar." : status === "DRAFT" ? "Rascunho salvo." : "Evento enviado para revisão.", evento, published: liveUpdate, reviewReasons: sensitive };
    }
    catch (error) {
        await removeEventImages(savedFiles);
        return { success: false, message: error instanceof Error && error.message === "CONCURRENT_EVENT_CHANGE" ? "O evento foi alterado durante a edição. Atualize a página e tente novamente." : error instanceof Error && error.message.startsWith("Use imagens") ? error.message : "Não foi possível salvar o evento." };
    }
}
export async function salvarEvento(formData: FormData, userId: string, resolveCurrentUser: ResolveCurrentUser) { return save(formData, userId, null, true, resolveCurrentUser); }
export async function salvarRascunho(formData: FormData, userId: string, resolveCurrentUser: ResolveCurrentUser) { return save(formData, userId, null, false, resolveCurrentUser); }
export async function atualizarEvento(eventId: string, formData: FormData, submit: boolean, resolveCurrentUser: ResolveCurrentUser) { return save(formData, null, eventId, submit, resolveCurrentUser); }
export async function getOwnedEvent(id: string, resolveCurrentUser: ResolveCurrentUser): Promise<Evento | null> {
    const user = await actor(resolveCurrentUser);
    if (!user)
        return null;
    const event = await prisma.events.findFirst({ where: { id, ...(user.role === "ADMIN" ? {} : { userId: user.id }) }, select: { ...publicEventSelect, reviewNote: true, ticketsEnabled: true, ticketCapacity: true, requiresApproval: true } });
    return event ? { ...event, validate: event.validate ?? false } : null;
}
export async function duplicarEvento(eventId: string, resolveCurrentUser: ResolveCurrentUser) {
    try {
        const user = await actor(resolveCurrentUser);
        if (!user)
            return { success: false, message: "Acesso negado." };
        const source = await prisma.events.findFirst({ where: { id: eventId, ...(user.role === "ADMIN" ? {} : { userId: user.id }) } });
        if (!source)
            return { success: false, message: "Evento não encontrado." };
        const evento = await prisma.$transaction(async (transaction) => {
            const event = await transaction.events.create({ data: {
                    nome: source.nome + " (cópia)", descricao: source.descricao, endereco: source.endereco,
                    organizerName: source.organizerName,
                    banner: source.banner, carrossel: source.carrossel, linkParaCompra: source.linkParaCompra,
                    dataInicio: "", dataFim: "", category: source.category, priceCents: source.priceCents,
                    isFree: source.isFree, lat: source.lat, lng: source.lng, startTime: source.startTime,
                    capacity: source.capacity, requiresApproval: source.requiresApproval, ageRating: source.ageRating, accessibilityInfo: source.accessibilityInfo, participationInfo: source.participationInfo,
                    endTime: source.endTime, userId: user.id, status: "DRAFT", validate: false,
                } });
            await record(transaction, event, user, "DUPLICATED");
            return event;
        });
        return { success: true, message: "Cópia criada como rascunho. Defina as novas datas.", evento };
    }
    catch {
        return { success: false, message: "Não foi possível duplicar o evento." };
    }
}
export async function cancelarEvento(eventId: string, resolveCurrentUser: ResolveCurrentUser) {
    try {
        const user = await actor(resolveCurrentUser);
        if (!user)
            return { success: false, message: "Acesso negado." };
        const evento = await prisma.$transaction(async (transaction) => {
            const event = await transaction.events.findFirst({ where: { id: eventId, ...(user.role === "ADMIN" ? {} : { userId: user.id }) } });
            if (!event || event.status !== "PUBLISHED")
                return null;
            // Sold tickets must be refunded first (and open Pix payments must finish), so no buyer stays charged for a cancelled event.
            const ticketsOutstanding = await transaction.ticketOrder.count({ where: { eventId: event.id, OR: [{ status: "PAID" }, { status: "PENDING", expiresAt: { gt: new Date() } }] } });
            if (ticketsOutstanding)
                return "TICKETS_OUTSTANDING" as const;
            const changed = await transaction.events.update({ where: { id: event.id }, data: { status: "CANCELLED", validate: false, ticketsEnabled: false } });
            await record(transaction, changed, user, "CANCELLED");
            // Notify attendees before closing their registrations (BE-02).
            await notifyEventAudience(transaction, changed, { title: "Evento cancelado", message: changed.nome + " foi cancelado pelo organizador. Inscrições e lista de espera foram encerradas.", includeRegistrations: true });
            await transaction.eventRegistration.updateMany({ where: { eventId: changed.id, status: { in: ["CONFIRMED", "WAITLISTED", "PENDING", "APPROVED"] } }, data: { status: "CANCELLED", qrVersion: { increment: 1 } } });
            return changed;
        });
        if (evento === "TICKETS_OUTSTANDING")
            return { success: false, message: "Este evento tem ingressos pagos ou Pix em andamento. Estorne os ingressos em Pagamentos (e aguarde até 30 minutos pelos Pix abertos) antes de cancelar." };
        return { success: Boolean(evento), message: evento ? "Evento cancelado; inscritos foram avisados e a página e o histórico foram preservados." : "Evento indisponível.", evento };
    }
    catch {
        return { success: false, message: "Não foi possível cancelar o evento." };
    }
}
export async function solicitarCorrecao(eventId: string, reason: string, resolveCurrentUser: ResolveCurrentUser) {
    try {
        const user = await actor(resolveCurrentUser);
        if (!user || user.role !== "ADMIN")
            return { success: false, message: "Acesso negado." };
        const note = reason.trim();
        if (note.length < 5 || note.length > 2000)
            return { success: false, message: "Explique a correção em 5 a 2000 caracteres." };
        const evento = await prisma.$transaction(async (transaction) => {
            const changed = await transaction.events.updateMany({ where: { id: eventId, status: "PENDING" }, data: { status: "CHANGES_REQUESTED", reviewNote: note, validate: false } });
            if (!changed.count)
                return null;
            const event = await transaction.events.findUniqueOrThrow({ where: { id: eventId } });
            await record(transaction, event, user, "CHANGES_REQUESTED", note);
            await notifyEventAudience(transaction, event, { title: "Correção solicitada", message: note });
            return event;
        });
        return { success: Boolean(evento), message: evento ? "Correção enviada ao promotor." : "O evento não está em análise.", evento };
    }
    catch {
        return { success: false, message: "Não foi possível solicitar a correção." };
    }
}
