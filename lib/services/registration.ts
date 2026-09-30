
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { sendVerificationEmail } from "@/lib/mail/verification";

export interface RegisterUserInput {
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
      status: "error",
      error: "O email já está registrado",
    };
  }

  // Generate verification token
  const token = uuidv4();
  const verificationLink = `${process.env.NEXT_PUBLIC_BASE_URL}/verifyEmail?token=${token}`;

  // Save the user data and token temporarily
  await prisma.verificationTokenEmail.create({
    data: {
      email: data.email,
      token,
      name: data.name,
      password: bcrypt.hashSync(data.password, 10), // Hash the password
    },
  });

  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: bcrypt.hashSync(data.password, 10),
    },
  });



  await sendVerificationEmail(data.email, verificationLink);

  return {
    status: "success",
    message: "Verificação de email enviada. Verifique seu email.",
  };
}
