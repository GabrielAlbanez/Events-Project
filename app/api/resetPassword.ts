import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "POST") {
    const { token, password } = req.body;

    // Verify the token
    const verificationTokenEmail = await prisma.verificationTokenEmail.findUnique({
      where: { token },
    });

    if (!verificationTokenEmail) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    await prisma.user.update({
        where: { email: verificationTokenEmail.email },
        data: { emailVerified: new Date() },
      });

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update the user's password
    await prisma.user.update({
      where: { email: verificationTokenEmail.email },
      data: { password: hashedPassword },
    });

    // Delete the token
    await prisma.verificationToken.delete({
      where: { token },
    });

    res.status(200).json({ message: "Password reset successfully" });
  } else {
    res.status(405).json({ message: "Method not allowed" });
  }
};