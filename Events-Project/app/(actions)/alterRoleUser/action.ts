"use server";

import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { alterRoleUser as executealterRoleUser } from "@/lib/services/userAdministration";
import type { User } from "@/types";

export default async function alterRoleUser(user: User, roleSelect : string) {
  return executealterRoleUser(user, roleSelect, getAuthenticatedAdminId);
}
