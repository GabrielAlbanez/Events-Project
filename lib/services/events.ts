import { Evento } from "@/types";
import prisma from "@/lib/prisma";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import { notifyEventAudience } from "@/lib/eventNotifications";
import { publicEventSelect } from "@/lib/eventQueries";
import { parseEventInput } from "@/schemas/eventInput";
import { Prisma, EventHistoryAction } from "@prisma/client";
import { saveEventImage, removeEventImages } from "@/lib/storage/eventImages";
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
        const existing = eventId ? await prisma.events.findUnique({ where: { id: eventId } }) : null;
        if (eventId && (!existing || (existing.userId !== user.id && user.role !== "ADMIN")))
            return { success: false, message: "Evento não encontrado ou acesso negado." };
        if (existing?.status === "CANCELLED" || existing?.status === "ENDED")
            return { success: false, message: "Este evento já foi encerrado. Duplique-o para criar uma nova edição." };
        const parsed = parseEventInput(formData, submit);
        if (!parsed.success)
            return parsed;
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
        const status = submit || existing?.status === "PUBLISHED" ? "PENDING" as const : "DRAFT" as const;
        const evento = await prisma.$transaction(async (transaction) => {
            const data = { ...parsed.data, banner, carrossel, status, validate: false, validatedAt: null, validatedBy: null, reviewNote: null };
            if (existing) {
                const changed = await transaction.events.updateMany({ where: { id: existing.id, updatedAt: existing.updatedAt, status: existing.status }, data });
                if (!changed.count)
                    throw new Error("CONCURRENT_EVENT_CHANGE");
            }
            const event = existing ? await transaction.events.findUniqueOrThrow({ where: { id: existing.id } }) : await transaction.events.create({ data: { ...data, userId: user.id } });
            await record(transaction, event, user, existing ? status === "PENDING" ? "SUBMITTED" : "UPDATED" : "CREATED");
            if (status === "PENDING")
                await notifyEventAudience(transaction, event, { title: "Evento em revisão", message: "O evento foi enviado para análise.", includeAdmins: true });
            if (existing?.status === "PUBLISHED")
                await notifyEventAudience(transaction, event, { title: "Evento atualizado", message: "O evento foi atualizado e está em revisão.", includeFavorites: true });
            if (existing?.status === "PUBLISHED")
                await transaction.favorite.updateMany({ where: { eventId: event.id }, data: { reminderSentAt: null } });
            return event;
        });
        return { success: true, message: status === "DRAFT" ? "Rascunho salvo." : "Evento enviado para revisão.", evento };
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
    const event = await prisma.events.findFirst({ where: { id, ...(user.role === "ADMIN" ? {} : { userId: user.id }) }, select: { ...publicEventSelect, reviewNote: true } });
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
                    banner: source.banner, carrossel: source.carrossel, linkParaCompra: source.linkParaCompra,
                    dataInicio: "", dataFim: "", category: source.category, priceCents: source.priceCents,
                    isFree: source.isFree, lat: source.lat, lng: source.lng, startTime: source.startTime,
                    capacity: source.capacity,
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
            const changed = await transaction.events.update({ where: { id: event.id }, data: { status: "CANCELLED", validate: false } });
            await record(transaction, changed, user, "CANCELLED");
            await notifyEventAudience(transaction, changed, { title: "Evento cancelado", message: "O organizador cancelou este evento." });
            return changed;
        });
        return { success: Boolean(evento), message: evento ? "Evento cancelado; a página e o histórico foram preservados." : "Evento indisponível.", evento };
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
