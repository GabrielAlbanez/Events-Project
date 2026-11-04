import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/authPolicy";
import { safeReturnPath } from "@/lib/authReturn";
import { authOptions } from "./options";

/** An old signed cookie alone must never prevent someone from signing in again. */
export async function redirectAuthenticatedAccount(callbackUrl?: string | string[]): Promise<void> {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.error && getSessionRole(session?.user ?? null) !== "GUEST") {
    redirect(safeReturnPath(typeof callbackUrl === "string" ? callbackUrl : null));
  }
}
