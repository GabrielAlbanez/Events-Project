"use client";

import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ActivityCard({ icon: Icon, title, eyebrow, children, href, action, urgent = false, quickActions }: {
  icon: LucideIcon; title: string; eyebrow: string; children: ReactNode; href: string; action: string; urgent?: boolean; quickActions?: ReactNode;
}) {
  return <article className={`group flex h-full min-w-0 flex-col rounded-2xl border p-5 transition-colors ${urgent ? "border-violet-400/50 bg-violet-50 dark:bg-violet-400/10" : "bg-card hover:border-primary/30"}`}>
    <div className="flex items-start gap-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${urgent ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}><Icon className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0"><p className="break-words text-xs font-medium text-muted-foreground">{eyebrow}</p><h3 className="mt-1 break-words text-base font-semibold leading-6">{title}</h3></div>
    </div>
    <div className="my-4 flex-1 space-y-2 text-sm leading-6 text-muted-foreground">{children}</div>
    {quickActions && <div className="mb-3 flex flex-wrap gap-2">{quickActions}</div>}
    <Link href={href} className="inline-flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-background px-3 text-sm font-semibold transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>{action}</span><ArrowUpRight className="size-4 shrink-0" aria-hidden="true" /></Link>
  </article>;
}

export function ActivitySection({ id, title, description, count, truncated, children }: { id: string; title: string; description: string; count: number; truncated: boolean; children: ReactNode }) {
  return <section aria-labelledby={`${id}-heading`} className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><div className="flex items-center gap-2"><h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">{title}</h2><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{count}</span></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>{truncated && <p className="text-xs text-muted-foreground">Exibindo até 20 itens nesta seção.</p>}</div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  </section>;
}
