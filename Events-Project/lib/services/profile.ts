import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { z } from "zod";
import type { ResolveCurrentUser } from "@/lib/services/authContext";

export type ProfileUpdateInput = {
    name?: string;
    password?: string;
    newPassword?: string;
    email: string;
}

const profileUpdateSchema = z.object({
    name: z.string().trim().min(2, "Informe pelo menos 2 caracteres para o nome.").max(50, "O nome pode ter no máximo 50 caracteres.").optional(),
    email: z.string().email("Informe um e-mail válido."),
    password: z.string().max(72, "A senha atual é inválida.").optional(),
    newPassword: z.string().optional(),
}).superRefine((data, context) => {
    if (Boolean(data.password) !== Boolean(data.newPassword)) {
        context.addIssue({ code: "custom", message: "Preencha a senha atual e a nova senha.", path: ["newPassword"] });
    }
    if (data.newPassword && (data.newPassword.length < 6 || data.newPassword.length > 50)) {
        context.addIssue({ code: "custom", message: "A nova senha deve ter entre 6 e 50 caracteres.", path: ["newPassword"] });
    }
    if (data.newPassword && Buffer.byteLength(data.newPassword, "utf8") > 72) {
        context.addIssue({ code: "custom", message: "A nova senha excede o tamanho permitido.", path: ["newPassword"] });
    }
});

export const resetDataProfile = async (data: ProfileUpdateInput, resolveCurrentUser: ResolveCurrentUser) => {
    try {
        const identity = await resolveCurrentUser();
        if (!identity?.id) {
            return { status: "error", message: "Entre na sua conta para atualizar o perfil." };
        }

        const parsed = profileUpdateSchema.safeParse(data);
        if (!parsed.success) {
            return { status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
        }
        const { name, password, newPassword, email } = parsed.data;
        const user = await prisma.user.findUnique({
            where: { id: identity.id },
            select: { id: true, email: true, name: true, password: true },
        });
        if (!user || user.email !== email) {
            return { status: "error", message: "Não foi possível atualizar este perfil." };
        }

        const updateData: Prisma.UserUpdateInput = {};
        if (name !== undefined && name !== user.name) updateData.name = name;

        if (password && newPassword) {
            if (!user.password) {
                return { status: "error", message: "Esta conta não permite alterar a senha por este formulário." };
            }
            if (!await bcrypt.compare(password, user.password)) {
                return { status: "error", message: "Senha atual incorreta" };
            }
            if (await bcrypt.compare(newPassword, user.password)) {
                return { status: "error", message: "A nova senha não pode ser igual à senha atual" };
            }
            updateData.password = await bcrypt.hash(newPassword, 10);
            updateData.sessionVersion = { increment: 1 };
        }

        if (Object.keys(updateData).length === 0) {
            return { status: "error", message: "Nenhuma alteração foi feita" };
        }
        const updated = await prisma.$transaction(async transaction => {
            const result = await transaction.user.updateMany({
                where: { id: user.id, password: user.password },
                data: updateData,
            });
            if (result.count === 1 && updateData.password !== undefined) {
                await transaction.communitySignal.create({ data: { room: `user:${user.id}` } });
            }
            return result;
        });
        if (updated.count !== 1) {
            return { status: "error", message: "Seu perfil foi alterado em outra solicitação. Atualize a página e tente novamente." };
        }
        return { status: "success", message: "Perfil atualizado com sucesso" };
    } catch {
        return { status: "error", message: "Não foi possível atualizar o perfil. Tente novamente." };
    }
}
