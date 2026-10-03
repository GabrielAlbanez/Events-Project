import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import { getAllUsers as executegetAllUsers } from "@/lib/services/userAdministration";

export async function getAllUsers() {
  return executegetAllUsers(getAuthenticatedAdminId);
}
