"use server";

import prisma from "@/lib/prisma";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { User } from "@/types";
import { Role } from "@prisma/client";

const alterRoleUser = async (user: User, roleSelect : string) => {
  if (!await getAuthenticatedAdminId()) {
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
};

export default alterRoleUser;
