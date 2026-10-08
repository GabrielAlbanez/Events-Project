import prisma from "@/lib/prisma";

const verificationLifetimeMs = 24 * 60 * 60 * 1000;
const invalidMessage = "Link de verificação inválido ou expirado.";

export async function verifyEmailToken(token: string | null) {
  if (!token || token.length > 128) return { status: "error", message: invalidMessage };

  try {
    return await prisma.$transaction(async (transaction) => {
      const verification = await transaction.verificationTokenEmail.findUnique({
        where: { token },
        select: { id: true, email: true, createdAt: true },
      });
      if (!verification || verification.createdAt.getTime() < Date.now() - verificationLifetimeMs) {
        return { status: "error", message: invalidMessage };
      }

      const claimed = await transaction.verificationTokenEmail.deleteMany({
        where: { id: verification.id, token },
      });
      if (!claimed.count) return { status: "error", message: invalidMessage };

      const updated = await transaction.user.updateMany({
        where: { email: verification.email },
        data: { emailVerified: true },
      });
      if (!updated.count) throw new Error("VERIFICATION_USER_UNAVAILABLE");
      return { status: "success", message: "E-mail verificado com sucesso." };
    });
  } catch {
    return { status: "error", message: "Não foi possível verificar o e-mail. Tente novamente.", retryable: true };
  }
}
