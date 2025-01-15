"use server";

import prisma from "@/lib/prisma";
import { User } from "@/types";

type Role = "USER" | "ADMIN" | "GUEST"; // Define Role type here

const alterRoleUser = async (user: User, roleSelect : string) => {
  const { role, id } = user;



  const alterRole = await prisma.user.update({
    where: {
      id
    },
    data: {
      role: roleSelect as any, // Use 'any' to bypass the type error
    },
  });

  if(alterRole) {
    return {
      status: "success",
      message: "Role do usuario alterado com sucesso",
    };
  }
};

export default alterRoleUser;
