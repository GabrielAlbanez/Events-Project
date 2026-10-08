import prisma from "@/lib/prisma";
import type { User } from "@/types";
import { Role } from "@prisma/client";
import type { ResolveAdminId } from "@/lib/services/authContext";
import { getAdminUsersPage } from "@/lib/services/adminPagination";

export async function getAllUsers(resolveAdminId: ResolveAdminId) {
  try {
    if (!await resolveAdminId()) {
      return { status: "error", message: "Acesso negado." };
    }
    return await getAdminUsersPage(resolveAdminId);
  } catch {
    return { status: "error", message: "Error fetching users" };
  }
}

export async function deleteUser(user: User, resolveAdminId: ResolveAdminId) {
  const adminId = await resolveAdminId();
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

  const deletedUser = await prisma.$transaction(async tx => {
    const deleted = await tx.user.deleteMany({
      where: { id, role: { not: "ADMIN" } },
    });
    if (deleted.count > 0) {
      // The signal has no user foreign key, so it survives the account deletion.
      // Commit both operations together so every successful deletion revokes sockets.
      await tx.communitySignal.create({ data: { room: `user:${id}` } });
    }
    return deleted;
  });

  if (deletedUser.count > 0) {
    return {
      status: "success",
      message: "Usuário deletado com sucesso",
    };
  }
  return { status: "error", message: "Este usuário não pode ser excluído." };
}

export async function alterRoleUser(user: User, roleSelect : string, resolveAdminId: ResolveAdminId) {
  if (!await resolveAdminId()) {
    return { status: "error", message: "Você não tem permissão para alterar usuários." };
  }
  if (!user?.id || !Object.values(Role).includes(roleSelect as Role)) {
    return { status: "error", message: "Dados de usuário inválidos." };
  }
  const alterRole = await prisma.user.updateMany({
    where: {
      id: user.id,
      role: { not: "ADMIN" },
    },
    data: {
      role: roleSelect as Role,
    },
  });

  if (alterRole.count === 0) {
    return { status: "error", message: "Este usuário não pode ter seu papel alterado." };
  }

  if (alterRole.count > 0) {
    return {
      status: "success",
      message: "Role do usuario alterado com sucesso",
    };
  }
}
