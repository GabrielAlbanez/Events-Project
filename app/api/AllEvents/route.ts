import getAllEvents from "@/app/(actions)/getAlllEvents/action";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await getAllEvents()); }
  catch { return NextResponse.json({ message: "Não foi possível carregar eventos." }, { status: 503 }); }
}
