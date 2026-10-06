"use server";

import { validateUser as validateCredentials, type LoginUserInputData } from "@/lib/services/credentials";

export async function validateUser(data: LoginUserInputData) {
  return validateCredentials(data);
}
