import { NextRequest } from "next/server";
import { accountRecoveryPost } from "@/lib/services/accountRecoveryHttp";
export const dynamic = "force-dynamic";
export function POST(request: NextRequest) { return accountRecoveryPost(request, "verification"); }
