import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { sendVerificationEmail } from "@/lib/mail/verification";
import { registerAccountInputSchema } from "@/schemas/accountInput";
import { publicSiteUrl } from "@/lib/publicUrl";

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export async function registerUser(data: RegisterUserInput) {
  const parsed = registerAccountInputSchema.safeParse(data);
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0]?.message ?? "Dados de cadastro inválidos." };
  }

  try {
    const { name, email, password } = parsed.data;
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      return { status: "error", error: "O email já está registrado" };
    }

    const token = uuidv4();
    const verificationUrl = new URL("/verifyEmail", publicSiteUrl());
    verificationUrl.searchParams.set("token", token);
    const verificationLink = verificationUrl.href;
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction(async (transaction) => {
      await transaction.user.create({ data: { name, email, password: passwordHash } });
      await transaction.verificationTokenEmail.create({
        data: { name, email, token, password: passwordHash },
      });
    });
    await sendVerificationEmail(email, verificationLink);
    return {
      status: "success",
      message: "Verificação de email enviada. Verifique seu email.",
    };
  } catch {
    return { status: "error", error: "Não foi possível concluir o cadastro. Tente novamente." };
  }
}
