import Image from "next/image";
import { CalendarDays, MapPin, Sparkles } from "lucide-react";
import { ParallaxCard } from "@/components/animations/ParallaxCard";

export function LoginPresentation() {
  return (
    <section aria-labelledby="login-introduction" className="relative mx-auto w-full min-w-0 max-w-md xl:max-w-none xl:rounded-[2rem] xl:border xl:border-border xl:bg-card xl:p-8 xl:shadow-surface">
      <div className="relative z-10">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Descubra. Encontre. Viva.</p>
        <h2 id="login-introduction" className="mt-3 text-2xl font-semibold leading-tight tracking-tight xl:mt-5 xl:text-4xl">Encontre seu próximo momento.</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground xl:text-base xl:leading-7">Eventos por perto, pessoas para conhecer e experiências para viver.</p>
      </div>
      <div aria-hidden="true" className="relative mt-4 h-24 overflow-hidden rounded-3xl border border-border bg-muted xl:mt-7 xl:h-auto xl:aspect-square">
        <Image src="/branding/login-city-v1.webp" alt="" width={960} height={960} sizes="(min-width: 1280px) 460px, (min-width: 448px) 448px, 100vw" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <ParallaxCard pointerHost="parent" className="pointer-events-none absolute inset-0 hidden xl:block" decorationClassName="absolute inset-0" secondaryClassName="absolute inset-0" secondaryDecoration={<span className="absolute bottom-8 right-5 flex items-center gap-2 rounded-2xl border border-border bg-card/95 px-4 py-3 text-xs font-medium text-foreground shadow-surface"><CalendarDays className="h-4 w-4 text-primary" />Sua próxima experiência</span>}>
          <span className="absolute left-5 top-7 flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2.5 text-xs font-medium text-foreground shadow-surface"><MapPin className="h-4 w-4 text-primary" />Descubra por perto</span>
          <span className="absolute bottom-8 left-5 grid h-12 w-12 place-items-center rounded-2xl border border-border bg-card/95 text-primary shadow-surface"><MapPin className="h-5 w-5" /></span>
        </ParallaxCard>
      </div>
    </section>
  );
}
