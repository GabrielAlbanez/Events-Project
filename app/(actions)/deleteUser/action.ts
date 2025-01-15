"use server";

import prisma from "@/lib/prisma";
import { User } from "@/types";

const deleteUser = async (user: User) => {
  const { id } = user;

  if (!id) {
    return {
      status: "error",
      message: "Aconteceu um erro ao logar",
    };
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

  const deletedUser = await prisma.user.delete({
    where: { id },
  });

  if (deletedUser) {
    return {
      status: "error",
      message: "Usuário deletado com sucesso",
    };
  }
};

export default deleteUser;
