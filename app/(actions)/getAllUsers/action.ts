import prisma from "@/lib/prisma";

export async function getAllUsers() {
  try {
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
  } catch (error) {
    console.error("Error fetching users:", error);
    return { status: "error", message: "Error fetching users" };
  }
}