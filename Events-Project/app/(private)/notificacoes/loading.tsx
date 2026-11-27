import { ListPageSkeleton } from "@/components/ui/route-skeletons";

export default function NotificationsLoading() {
  return <ListPageSkeleton label="Carregando notificações..." rows={6} />;
}
