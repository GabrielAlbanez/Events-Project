import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Block = { className?: string };

function Bone({ className }: Block) {
  return <Skeleton className={cn("motion-reduce:animate-none", className)} />;
}

function Frame({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={cn("mx-auto space-y-6", wide ? "max-w-6xl" : "max-w-5xl")}>{children}</div>
    </div>
  );
}

function HeaderBones() {
  return (
    <div className="space-y-3">
      <Bone className="h-4 w-28" />
      <Bone className="h-9 w-3/4 max-w-md" />
      <Bone className="h-4 w-full max-w-xl" />
    </div>
  );
}

/** Generic list page: heading, filters and stacked rows (agenda, notificações, meus eventos). */
export function ListPageSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <Frame label={label}>
      <HeaderBones />
      <div className="flex flex-wrap gap-2">
        <Bone className="h-11 w-28 rounded-xl" />
        <Bone className="h-11 w-24 rounded-xl" />
        <Bone className="h-11 w-32 rounded-xl" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 rounded-2xl border bg-card p-4">
            <Bone className="h-14 w-14 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bone className="h-4 w-2/3" />
              <Bone className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Dashboard-like page: heading plus a grid of cards (atividade, salas). */
export function CardGridSkeleton({ label, cards = 6 }: { label: string; cards?: number }) {
  return (
    <Frame label={label}>
      <HeaderBones />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="space-y-3 rounded-3xl border bg-card p-5">
            <Bone className="h-10 w-10 rounded-xl" />
            <Bone className="h-5 w-2/3" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    </Frame>
  );
}
