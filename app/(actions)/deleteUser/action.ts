"use server";

import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { deleteUser as executedeleteUser } from "@/lib/services/userAdministration";
import type { User } from "@/types";

export default async function deleteUser(user: User) {
  return executedeleteUser(user, getAuthenticatedAdminId);
}
