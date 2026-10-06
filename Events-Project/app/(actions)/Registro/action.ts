"use server";

import { registerUser as registerAccount, type RegisterUserInput } from "@/lib/services/registration";

export async function registerUser(data: RegisterUserInput) {
  return registerAccount(data);
}
