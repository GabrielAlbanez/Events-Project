import { ListPageSkeleton } from "@/components/ui/route-skeletons";

export default function MyEventsLoading() {
  return <ListPageSkeleton label="Carregando seus eventos..." rows={4} />;
}
