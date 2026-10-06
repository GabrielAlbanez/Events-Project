import { NextRequest, NextResponse } from "next/server";
import { checkOrigin, communityError, readCommunityBody } from "@/lib/community/http";
import { recoveryEmailSchema } from "@/schemas/passwordRecovery";
import { requestAccountLink, resetAccountPassword } from "./passwordRecovery";

export async function accountRecoveryPost(request: NextRequest, action: "recovery" | "verification" | "reset") {
  try {
    checkOrigin(request);
    const body = await readCommunityBody(request);
    const clientKey = process.env.TRUST_PROXY_IP === "true"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 100) || "global"
      : "global";
    const result = action === "reset" ? await resetAccountPassword(body)
      : await requestAccountLink(recoveryEmailSchema.parse(body).email, action, clientKey);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return communityError(error); }
}
