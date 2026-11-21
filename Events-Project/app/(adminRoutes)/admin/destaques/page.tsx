import type { Metadata } from "next";
import AdminPromotions from "@/components/MyComponents/promotions/AdminPromotions";

export const metadata: Metadata = { title: "Destaques pagos" };

export default function AdminPromotionsPage() {
  return <AdminPromotions />;
}
