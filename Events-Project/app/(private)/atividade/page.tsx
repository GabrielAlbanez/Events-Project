import type { Metadata } from "next";
import { ActivityDashboard } from "@/components/MyComponents/ActivityDashboard";

export const metadata: Metadata = {
  title: "Central de atividades",
  description: "Acompanhe suas filas, tarefas, próximos eventos e salas com amigos.",
};

export default function ActivityPage() {
  return <ActivityDashboard />;
}
