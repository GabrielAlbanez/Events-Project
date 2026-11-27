import { CardGridSkeleton } from "@/components/ui/route-skeletons";

export default function RoomsLoading() {
  return <CardGridSkeleton label="Carregando salas..." cards={4} />;
}
