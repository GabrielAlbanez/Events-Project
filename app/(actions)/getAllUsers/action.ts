import prisma from "@/lib/prisma";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";

export async function getAllUsers() {
  try {
    if (!await getAuthenticatedAdminId()) {
      return { status: "error", message: "Acesso negado." };
    }
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image : true,
        Events : true,
        emailVerified : true,

      },
    });
    return { status: "success", data: users };
  } catch {
    return { status: "error", message: "Error fetching users" };
  }
}
