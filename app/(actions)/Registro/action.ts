"use server";
import prisma from "@/lib/prisma";
import b from "bcrypt"

interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export async function registerUser(data: RegisterUserInput) {
  // Verifica se o email já está registrado
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    return {
        status : "error",
        error : "O email já está registrado"
    }
  }

  // Cria o usuário (adicione hash para a senha em produção)

  const hashPassword = b.hashSync(data.password,10)

  const newUser = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashPassword, // Hash a senha com bcrypt em produção
    },
  });

  return {
    status : "sucess",
    message: "Usuário registrado com sucesso",
    user: newUser,
  };
}
