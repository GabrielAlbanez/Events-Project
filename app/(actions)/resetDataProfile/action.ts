"use server"
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

type Data = {
    name?: string;
    password?: string;
    newPassword?: string;
    email: string;
}

const resetDataProfile = async (data: Data) => {
    const { name, password, newPassword, email } = data;

    console.log("dados pego", name, password, newPassword);

    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        return {
            status: "error",
            message: "Usuário não encontrado"
        };
    }

    const updateData: any = {};

    if (name) {
        if(name === user.name && !password && !newPassword) {
            return { status: "error", message: "O nome não pode ser igual ao atual" };
        }
        updateData.name = name;
    }

    if (password && newPassword) {
        if (!user.password) {
            return {
                status: "error",
                message: "Senha atual não encontrada"
            };
        }
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return {
                status: "error",
                message: "Senha atual incorreta"
            };
        }

        if (password === newPassword) {
            return {
                status: "error",
                message: "A nova senha não pode ser igual à senha atual"
            };
        }

        updateData.password = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(updateData).length === 0) {
        return {
            status: "error",
            message: "Nenhuma alteração foi feita"
        };
    }

    await prisma.user.update({
        where: { email },
        data: updateData
    });

    return {
        status: "success",
        message: "Perfil atualizado com sucesso"
    };
}

export default resetDataProfile;