import { ListPageSkeleton } from "@/components/ui/route-skeletons";

export default function SavedEventsLoading() {
  return <ListPageSkeleton label="Carregando sua agenda..." rows={4} />;
}
