"use server";

import prisma from "@/lib/prisma";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { User } from "@/types";

const deleteUser = async (user: User) => {
  const adminId = await getAuthenticatedAdminId();
  if (!adminId) {
    return { status: "error", message: "Você não tem permissão para excluir usuários." };
  }
  const id = user?.id;

  if (!id) {
    return {
      status: "error",
      message: "Aconteceu um erro ao logar",
    };
  }

  if (id === adminId) {
    return { status: "error", message: "Você não pode excluir sua própria conta." };
  }

  const exisgingUser = await prisma.user.findUnique({
    where: { id },
  });

  if (!exisgingUser) {
    return {
      status: "error",
      message: "Usuário não encontrado",
    };
  }

  if (exisgingUser.role === "ADMIN") {
    return { status: "error", message: "Este usuário não pode ser excluído." };
  }

  const deletedUser = await prisma.user.deleteMany({
    where: { id, role: { not: "ADMIN" } },
  });

  if (deletedUser.count > 0) {
    return {
      status: "success",
      message: "Usuário deletado com sucesso",
    };
  }
  return { status: "error", message: "Este usuário não pode ser excluído." };
};

export default deleteUser;
