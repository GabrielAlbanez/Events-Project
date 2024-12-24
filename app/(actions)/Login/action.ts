"use server";

import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

interface LoginUserInputData {
  email: string;
  password: string;
}

export async function validateUser(data: LoginUserInputData) {
  const { email, password } = data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      return {
        status: "error",
        error: "Email ou senha incorretos.",
      };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return {
        status: "error",
        error: "Email ou senha incorretos.",
      };
    }

    return {
      status: "success",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
    };
  } catch (error) {
    console.error("Erro ao validar o usuário:", error);
    return {
      status: "error",
      error: "Erro inesperado durante o login.",
    };
  }
}
