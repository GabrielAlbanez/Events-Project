import Link from "next/link";

/** Institutional links shared by the public pages. Hook-free, so it renders in server or client trees. */
export const siteFooterLinks = [
  { href: "/conheca", label: "Como funciona" },
  { href: "/para-organizadores", label: "Para organizadores" },
  { href: "/termos", label: "Termos de Uso" },
  { href: "/privacidade", label: "Privacidade" },
] as const;

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-border px-4 py-6 sm:px-6 lg:px-10 ${className}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">EventMap — descubra e organize eventos perto de você.</p>
        <nav aria-label="Links institucionais">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {siteFooterLinks.map(link => (
              <li key={link.href}>
                <Link href={link.href} className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

export default SiteFooter;
