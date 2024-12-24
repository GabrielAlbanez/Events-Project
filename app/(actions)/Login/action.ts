"use server";

import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

interface LoginUserInputData {
  email: string;
  password: string;
}
export async function validateUser(data: LoginUserInputData) {
  const { email, password } = data;

  console.log("Dados recebidos para validação:", data);

  try {
    const userWithAccounts = await prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    });

    console.log("Usuário encontrado:", userWithAccounts);

    if (userWithAccounts) {
      const hasDifferentProvider = userWithAccounts.accounts.some(
        (account) => account.provider !== "credentials"
      );

      if (hasDifferentProvider) {
        return {
          status: "error",
          error: `Este e-mail já está vinculado a outro provedor de autenticação.`,
        };
      }
    }

    if (!userWithAccounts || !userWithAccounts.password) {
      return {
        status: "error",
        error: "Email ou senha incorretos.",
      };
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      userWithAccounts.password
    );

    if (!isPasswordValid) {
      return {
        status: "error",
        error: "Email ou senha incorretos.",
      };
    }

    return {
      status: "success",
      user: {
        id: userWithAccounts.id,
        name: userWithAccounts.name,
        email: userWithAccounts.email,
        image: userWithAccounts.image,
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

