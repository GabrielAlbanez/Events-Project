"use server";
import { listPublicCatalog } from "@/lib/eventQueries";
// Public read kept for existing callers; the catalog query lives in lib/eventQueries.
export default async function getAllEvents() {
  return listPublicCatalog();
}
